/**
 * StreamingManager
 * 
 * Manages the streaming of LLM responses to clients.
 * Handles:
 * - Token streaming
 * - Progress tracking
 * - Cancellation support
 * - Error handling
 * - WebSocket streaming
 */

import { StreamCallbacks } from './types';
import logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

interface StreamProgress {
  requestId: string;
  sessionId: string;
  messageId: string;
  startTime: number;
  tokenCount: number;
  status: 'active' | 'completed' | 'cancelled' | 'error';
  content?: string;
  error?: string;
  websocket?: WebSocket;
}

interface WebSocketMessage {
  type: 'token' | 'complete' | 'error' | 'cancelled';
  content?: string;
  streamId: string;
  error?: string;
}

// stream manager class for managing streaming LLM responses
export class StreamingManager {
  private activeStreams: Map<string, StreamProgress> = new Map();
  private messageToRequestMap = new Map<string, string>();

  /**
   * Stream a response using an async generator
   */
  async streamResponse(
    connectionId: string,
    sessionId: string,
    messageId: string,
    generator: AsyncIterable<any>,
    callbacks?: StreamCallbacks & { websocket?: WebSocket }
  ): Promise<StreamProgress> {
    const requestId = uuidv4();
    const progress: StreamProgress = {
      requestId,
      sessionId,
      messageId,
      startTime: Date.now(),
      tokenCount: 0,
      status: 'active',
      websocket: callbacks?.websocket
    };

    // Store mapping from messageId to requestId for later lookup
    this.messageToRequestMap.set(messageId, requestId);

    // Register active stream
    this.activeStreams.set(requestId, progress);

    try {
      // Signal start
      callbacks?.onStart?.();
      if (progress.websocket) {
        this.sendWebSocketMessage(progress.websocket, {
          type: 'token',
          content: '',
          streamId: requestId
        });
      }

      let accumulatedContent = '';

      // Stream tokens
      for await (const chunk of generator) {
        // Check if stream was cancelled
        if (this.activeStreams.get(requestId)?.status === 'cancelled') {
          progress.status = 'cancelled';
          this.activeStreams.set(requestId, progress);
          
          if (progress.websocket) {
            this.sendWebSocketMessage(progress.websocket, {
              type: 'cancelled',
              streamId: requestId
            });
          }
          return progress;
        }

        const token = chunk.toString();
        accumulatedContent += token;
        
        // Update callback
        callbacks?.onToken?.(token);
        
        // Send to WebSocket if connected
        if (progress.websocket) {
          this.sendWebSocketMessage(progress.websocket, {
            type: 'token',
            content: token,
            streamId: requestId
          });
        }
        
        // Update progress
        progress.tokenCount++;
        this.activeStreams.set(requestId, progress);
      }

      // Signal completion
      progress.status = 'completed';
      progress.content = accumulatedContent;
      this.activeStreams.set(requestId, progress);
      
      callbacks?.onComplete?.();
      
      if (progress.websocket) {
        this.sendWebSocketMessage(progress.websocket, {
          type: 'complete',
          streamId: requestId
        });
      }

      // Remove from active streams after a delay
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
      
      // Update callback
      callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage));
      
      // Send error to WebSocket if connected
      if (progress.websocket) {
        this.sendWebSocketMessage(progress.websocket, {
          type: 'error',
          error: errorMessage,
          streamId: requestId
        });
      }
      
      // Remove from active streams after a delay
      setTimeout(() => {
        this.activeStreams.delete(requestId);
      }, 5000);

      return progress;
    }
  }

  /**
   * Send a message to a WebSocket client
   */
  private sendWebSocketMessage(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
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

    // Notify WebSocket if connected
    if (stream.websocket) {
      this.sendWebSocketMessage(stream.websocket, {
        type: 'cancelled',
        streamId: requestId
      });
    }

    return true;
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

  /**
   * Get accumulated content for a stream by requestId
   */
  getStreamContent(requestId: string): string | null {
    const stream = this.activeStreams.get(requestId);
    return stream?.content || null;
  }

  /**
   * Get accumulated content by messageId
   */
  getContentByMessageId(messageId: string): string | null {
    const requestId = this.messageToRequestMap.get(messageId);
    if (!requestId) return null;
    return this.getStreamContent(requestId);
  }

  /**
   * Clean up resources for a message
   */
  cleanupMessageResources(messageId: string): void {
    const requestId = this.messageToRequestMap.get(messageId);
    if (requestId) {
      this.messageToRequestMap.delete(messageId);
      const stream = this.activeStreams.get(requestId);
      if (stream && (stream.status === 'completed' || stream.status === 'error')) {
        this.activeStreams.delete(requestId);
      }
    }
  }
} 