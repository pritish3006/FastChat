/**
 * StreamingManager
 * 
 * Manages the streaming of LLM responses to clients.
 * Handles:
 * - Token streaming
 * - Progress tracking
 * - Cancellation support
 * - Error handling
 * - Socket.IO streaming
 */

// @ts-nocheck
import { StreamChunk, StreamOptions, StreamSession, StreamCallbacks } from './types';
import logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Socket } from 'socket.io';
import { EventEmitter } from 'events';

export class StreamingManager {
  private activeStreams: Map<string, StreamSession> = new Map();
  private messageToRequestMap = new Map<string, string>();
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly DEFAULT_MAX_DURATION = 300000; // 5 minutes
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly DEFAULT_RATE_LIMIT = 60; // requests per minute
  private readonly DEFAULT_CLEANUP_INTERVAL = 60000; // 1 minute

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanupAbandonedStreams(), this.DEFAULT_CLEANUP_INTERVAL);
  }

  async initialize(): Promise<void> {
    // Start background task to clean up abandoned streams
    logger.info('StreamingManager initialized');
  }

  async streamResponse(
    connectionId: string,
    sessionId: string,
    messageId: string,
    generator: AsyncIterable<StreamChunk>,
    callbacks?: StreamCallbacks,
    options?: StreamOptions
  ): Promise<StreamSession> {
    const requestId = uuidv4();
    const startTime = Date.now();

    logger.info('=== [STREAMING MANAGER] Starting stream response ===', {
      requestId,
      connectionId,
      sessionId,
      messageId,
      options: options || {},
      timestamp: new Date().toISOString()
    });

    // Create stream session
    const session: StreamSession = {
      id: requestId,
      connectionId,
      sessionId,
      messageId,
      startTime,
      status: 'starting',
      tokensReceived: 0,
      duration: 0,
      content: '',
      error: null,
      metadata: {
        options: options || {}
      }
    };

    // Register the stream
    this.activeStreams.set(requestId, session);
    this.messageToRequestMap.set(messageId, requestId);

    logger.debug('=== [STREAMING MANAGER] Stream session created ===', {
      requestId,
      activeStreamsCount: this.activeStreams.size,
      messageToRequestMapSize: this.messageToRequestMap.size
    });

    // Process callbacks
    const streamCallbacks: StreamCallbacks = {
      onStart: async () => {
        logger.debug('=== [STREAMING MANAGER] Stream started ===', {
          requestId,
          timestamp: new Date().toISOString()
        });
        session.status = 'streaming';
        session.startTime = Date.now();
        
        if (callbacks?.onStart) {
          await callbacks.onStart();
        }
      },
      onToken: async (chunk: StreamChunk) => {
        logger.debug('=== [STREAMING MANAGER] Token received ===', {
          requestId,
          token: chunk.token?.substring(0, 50) + (chunk.token?.length > 50 ? '...' : ''),
          tokenLength: chunk.token?.length,
          totalTokens: session.tokensReceived + 1
        });
        // Update session with token
        session.content += chunk.token || '';
        session.tokensReceived += 1;
        session.duration = Date.now() - startTime;
        
        if (callbacks?.onToken) {
          await callbacks.onToken(chunk);
        }
      },
      onComplete: async (fullContent: string) => {
        session.status = 'done';
        session.content = fullContent;
        session.duration = Date.now() - startTime;
        
        if (callbacks?.onComplete) {
          await callbacks.onComplete(fullContent);
        }
        
        // Deregister after a delay to allow clients to query final state
        setTimeout(() => {
          this.activeStreams.delete(requestId);
          this.messageToRequestMap.delete(messageId);
        }, 60000); // Keep for 1 minute after completion
      },
      onError: async (error: Error) => {
        session.status = 'error';
        session.error = error.message;
        session.duration = Date.now() - startTime;
        
        if (callbacks?.onError) {
          await callbacks.onError(error);
        }
      }
    };

    // Start streaming in the background
    this.processStream(requestId, generator, streamCallbacks).catch(error => {
      logger.error('Stream processing error:', { requestId, error });
    });

    return session;
  }

  private handleStreamError(session: StreamSession, error: Error): void {
    logger.error('Stream error:', {
      streamId: session.id,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - session.startTime
    });

    session.status = 'error';
    session.chunks.push({
      type: 'error',
      error
    });
  }

  private sendSocketMessage(socket: Socket, message: {
    type: string;
    streamId: string;
    content?: string;
    metadata?: Record<string, any>;
  }): void {
    if (socket.connected) {
      socket.emit('stream_message', message);
    } else {
      logger.warn('Socket not connected for message:', {
        type: message.type,
        streamId: message.streamId
      });
    }
  }

  /**
   * Cleans up abandoned streams to prevent memory leaks
   */
  private cleanupAbandonedStreams(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    // Check each active stream
    const abandonedStreamIds: string[] = [];
    
    // Convert map entries to array for iteration instead of using MapIterator
    Array.from(this.activeStreams.entries()).forEach(([requestId, session]) => {
      const age = now - session.startTime;
      
      // Close abandoned streams
      if (age > maxAge) {
        abandonedStreamIds.push(requestId);
      }
    });
    
    // Close abandoned streams identified in the first pass
    for (const requestId of abandonedStreamIds) {
      this.closeSession(requestId, 'timeout', 'Stream abandoned due to timeout');
    }

    if (abandonedStreamIds.length > 0) {
      logger.info(`Cleaned up ${abandonedStreamIds.length} abandoned streams`);
    }
  }

  async cancelStream(requestId: string): Promise<boolean> {
    const session = this.activeStreams.get(requestId);
    if (!session || session.status !== 'streaming') {
      return false;
    }

    session.status = 'complete';
    session.chunks.push({
      type: 'error',
      error: new Error('Stream cancelled')
    });

    return true;
  }

  getStreamProgress(requestId: string): StreamSession | undefined {
    return this.activeStreams.get(requestId);
  }

  getAllActiveStreams(): Map<string, StreamSession> {
    // Create a new Map with only streaming sessions
    const streamingSessions = new Map<string, StreamSession>();
    
    Array.from(this.activeStreams.entries())
      .filter(([_, session]) => session.status === 'streaming')
      .forEach(([id, session]) => {
        streamingSessions.set(id, session);
      });
    
    return streamingSessions;
  }

  getStreamContent(requestId: string): string | null {
    const session = this.activeStreams.get(requestId);
    if (!session) return null;

    return session.chunks
      .filter(chunk => chunk.type === 'token' && chunk.content)
      .map(chunk => chunk.content!)
      .join('');
  }

  getContentByMessageId(messageId: string): string | null {
    const requestId = this.messageToRequestMap.get(messageId);
    if (!requestId) return null;
    return this.getStreamContent(requestId);
  }

  cleanupMessageResources(messageId: string): void {
    const requestId = this.messageToRequestMap.get(messageId);
    if (requestId) {
      this.messageToRequestMap.delete(messageId);
      const session = this.activeStreams.get(requestId);
      if (session && (session.status === 'complete' || session.status === 'error')) {
        this.activeStreams.delete(requestId);
      }
    }
  }

  private async closeSession(requestId: string, status: 'done' | 'cancelled' | 'error' | 'timeout', error?: string): Promise<void> {
    const session = this.activeStreams.get(requestId);
    if (!session) return;

    // Update session
    session.status = status;
    if (error) {
      session.error = error;
    }
    session.duration = Date.now() - session.startTime;

    // Handle specific status
    if (status === 'done' || status === 'cancelled' || status === 'error' || status === 'timeout') {
      logger.info(`Stream ${status}:`, { requestId });
    }

    // Remove from active streams after a delay
    setTimeout(() => {
      this.activeStreams.delete(requestId);
      if (session.messageId) {
        this.messageToRequestMap.delete(session.messageId);
      }
    }, 30000); // Keep for 30s after closing
  }

  /**
   * Process a stream in the background
   */
  private async processStream(
    requestId: string,
    generator: AsyncIterable<StreamChunk>,
    callbacks: StreamCallbacks
  ): Promise<void> {
    try {
      // Signal start
      await callbacks.onStart();
      
      let fullContent = '';
      
      // Process stream chunks
      for await (const chunk of generator) {
        const session = this.activeStreams.get(requestId);
        if (!session || session.status === 'cancelled' || session.status === 'error') {
          break;
        }
        
        // Process chunk
        if (chunk.token) {
          fullContent += chunk.token;
          await callbacks.onToken(chunk);
        }
      }
      
      // Signal completion
      const session = this.activeStreams.get(requestId);
      if (session && session.status !== 'cancelled' && session.status !== 'error') {
        await callbacks.onComplete(fullContent);
      }
    } catch (error) {
      logger.error('Error processing stream:', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      await callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      await this.closeSession(requestId, 'error', error instanceof Error ? error.message : String(error));
    }
  }
} 