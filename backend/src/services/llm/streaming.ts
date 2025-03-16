/**
 * StreamingManager
 * 
 * Manages the streaming of LLM responses to clients via WebSockets.
 * Handles:
 * - WebSocket connection management
 * - Token streaming
 * - Progress tracking
 * - Cancellation support
 * - Error handling
 */

import { WebSocket } from 'ws';
import { StreamCallbacks } from './types';
import logger from '../../utils/logger';
import { RedisManager } from './memory/redis';
import { v4 as uuidv4 } from 'uuid';

// interface to track response streaming progress
export interface StreamProgress {
  requestId: string;
  sessionId: string;
  messageId: string;
  startTime: number;
  tokenCount: number;
  status: 'active' | 'completed' | 'cancelled' | 'error';
  error?: string;
}

// stream manager class for managing streaming LLM responses to the client
export class StreamingManager {
  private connections: Map<string, WebSocket> = new Map();  // map of active connections
  private activeStreams: Map<string, StreamProgress> = new Map();   // map of active streams
  private redisManager?: RedisManager;  // redis manager for storing stream progress

  constructor(redisManager?: RedisManager) {
    this.redisManager = redisManager;
  }

  /**
   * Register a new WebSocket connection
   */
  registerConnection(sessionId: string, ws: WebSocket): string {
    const connectionId = uuidv4();  // generate unique connection ID
    this.connections.set(connectionId, ws);  // store connection in map
    
    // Remove connection when closed
    ws.on('close', () => {
      this.connections.delete(connectionId);
      // Cancel any active streams for this connection
      this.cancelActiveStreamsForConnection(connectionId);
      logger.info(`WebSocket connection closed for session ${sessionId}`);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for session ${sessionId}:`, error);
      this.connections.delete(connectionId);
    });

    logger.info(`New WebSocket connection registered for session ${sessionId}`);
    return connectionId;
  }

  /**
   * Stream a response to the client
   */
  async streamResponse(
    connectionId: string,
    sessionId: string,
    messageId: string,
    generator: AsyncIterable<any>,
    callbacks?: StreamCallbacks
  ): Promise<StreamProgress> {
    const ws = this.connections.get(connectionId);
    if (!ws) {
      throw new Error(`WebSocket connection not found for ID ${connectionId}`);
    }

    const requestId = uuidv4();
    const progress: StreamProgress = {
      requestId,
      sessionId,
      messageId,
      startTime: Date.now(),
      tokenCount: 0,
      status: 'active'
    };

    // Register active stream
    this.activeStreams.set(requestId, progress);

    // Store in Redis if available (for recovery/monitoring)
    if (this.redisManager) {
      const key = `stream:${requestId}`;
      await this.redisManager.set(key, JSON.stringify(progress), 3600); // 1 hour TTL
    }

    try {
      // Signal start
      callbacks?.onStart?.();
      ws.send(JSON.stringify({ 
        type: 'stream_start', 
        requestId, 
        sessionId,
        messageId 
      }));

      let accumulatedContent = '';

      // Stream tokens
      for await (const chunk of generator) {
        // Check if stream was cancelled
        if (this.activeStreams.get(requestId)?.status === 'cancelled') {
          ws.send(JSON.stringify({ 
            type: 'stream_cancelled', 
            requestId 
          }));
          
          // Update progress
          progress.status = 'cancelled';
          this.activeStreams.set(requestId, progress);
          
          if (this.redisManager) {
            await this.redisManager.set(`stream:${requestId}`, JSON.stringify(progress), 3600);
          }
          
          return progress;
        }

        const token = chunk.toString();
        accumulatedContent += token;
        
        // Send token to client
        ws.send(JSON.stringify({ 
          type: 'token', 
          content: token,
          requestId 
        }));
        
        // Update callback
        callbacks?.onToken?.(token);
        
        // Update progress
        progress.tokenCount++;
        this.activeStreams.set(requestId, progress);
        
        // Update in Redis periodically (every 10 tokens)
        if (this.redisManager && progress.tokenCount % 10 === 0) {
          await this.redisManager.set(`stream:${requestId}`, JSON.stringify(progress), 3600);
        }
      }

      // Signal completion
      progress.status = 'completed';
      this.activeStreams.set(requestId, progress);
      
      ws.send(JSON.stringify({ 
        type: 'stream_end', 
        requestId,
        content: accumulatedContent
      }));
      
      callbacks?.onComplete?.();
      
      // Update Redis
      if (this.redisManager) {
        await this.redisManager.set(`stream:${requestId}`, JSON.stringify(progress), 3600);
      }

      // Remove from active streams after a delay (allow client to process completion)
      setTimeout(() => {
        this.activeStreams.delete(requestId);
      }, 5000);

      return progress;
    } catch (error) {
      // Handle errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown streaming error';
      logger.error(`Streaming error for session ${sessionId}:`, error);
      
      // Update progress
      progress.status = 'error';
      progress.error = errorMessage;
      this.activeStreams.set(requestId, progress);
      
      // Notify client
      ws.send(JSON.stringify({ 
        type: 'stream_error', 
        requestId,
        error: errorMessage 
      }));
      
      // Update callback
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage));
      
      // Update Redis
      if (this.redisManager) {
        await this.redisManager.set(`stream:${requestId}`, JSON.stringify(progress), 3600);
      }
      
      // Remove from active streams after a delay
      setTimeout(() => {
        this.activeStreams.delete(requestId);
      }, 5000);

      return progress;
    }
  }

  /**
   * Cancel a specific stream
   */
  async cancelStream(requestId: string): Promise<boolean> {
    const stream = this.activeStreams.get(requestId);
    if (!stream || stream.status !== 'active') {
      return false;
    }

    // Update status
    stream.status = 'cancelled';
    this.activeStreams.set(requestId, stream);

    // Update Redis
    if (this.redisManager) {
      await this.redisManager.set(`stream:${requestId}`, JSON.stringify(stream), 3600);
    }

    return true;
  }

  /**
   * Cancel all active streams for a connection
   */
  async cancelActiveStreamsForConnection(connectionId: string): Promise<void> {
    const ws = this.connections.get(connectionId);
    if (!ws) return;

    // Find all active streams for this connection
    for (const [requestId, stream] of this.activeStreams.entries()) {
      if (stream.status === 'active') {
        await this.cancelStream(requestId);
      }
    }
  }

  /**
   * Get progress information for a stream
   */
  getStreamProgress(requestId: string): StreamProgress | undefined {
    return this.activeStreams.get(requestId);
  }

  /**
   * Get all active streams
   */
  getAllActiveStreams(): Map<string, StreamProgress> {
    return new Map(
      [...this.activeStreams.entries()].filter(([_, stream]) => stream.status === 'active')
    );
  }
} 