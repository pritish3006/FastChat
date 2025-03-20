/**
 * LLM WebSocket Manager
 * 
 * Manages WebSocket connections for real-time LLM interactions
 * Integrates with tRPC subscriptions for type-safe real-time communication
 */

import { EventEmitter } from 'events';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from './index';
import { RedisMemory } from './memory/redis';
import { StreamingManager } from './streaming';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../../utils/logger';
import type { Subscribable } from '@trpc/server/observable';
import type { Socket } from 'socket.io';

// Types for WebSocket events
export const chatEventSchema = z.object({
  type: z.literal('chat'),
  content: z.string(),
  sessionId: z.string().optional(),
  parentMessageId: z.string().optional(),
  systemPrompt: z.string().optional()
});

interface StreamData {
  type: 'token' | 'complete' | 'error' | 'cancelled';
  content?: string;
  error?: string;
  messageId: string;
}

// Minimal WebSocket interface for our needs
interface MinimalWebSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
}

export class LLMWebSocketManager {
  private llmService: LLMService;
  private redisMemory: RedisMemory;
  private streamingManager: StreamingManager;
  private connections: Map<string, Socket> = new Map();
  private sessions: Map<string, Set<string>> = new Map(); // sessionId -> Set<connectionId>
  private events = new EventEmitter();

  constructor(llmService: LLMService, redisMemory: RedisMemory) {
    this.llmService = llmService;
    this.redisMemory = redisMemory;
    this.streamingManager = new StreamingManager();
    logger.info('WebSocket manager initialized');
  }

  /**
   * Create a tRPC subscription for chat events
   */
  createChatSubscription(
    sessionId: string,
    content: string,
    systemPrompt?: string,
    parentMessageId?: string
  ) {
    logger.info('Creating chat subscription');
    const messageId = uuidv4();

    return observable<StreamData>((emit) => {
      // Start the chat process
      this.llmService.chat({
        sessionId,
        message: content,
        systemPrompt,
        parentMessageId,
        callbacks: {
          onToken: (token: string) => {
            emit.next({
              type: 'token',
              content: token,
              messageId
            });
          },
          onComplete: () => {
            emit.next({
              type: 'complete',
              messageId
            });
            emit.complete();
          },
          onError: (error: Error) => {
            emit.next({
              type: 'error',
              error: error.message,
              messageId
            });
            emit.error(error);
          }
        }
      }).catch((error) => {
        logger.error('Error in chat subscription:', error);
        emit.next({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId
        });
        emit.error(error);
      });

      // Return cleanup function
      return () => {
        this.streamingManager.cancelStream(messageId).catch(logger.error);
      };
    });
  }

  /**
   * Cancel an active stream
   */
  async cancelStream(streamId: string) {
    await this.streamingManager.cancelStream(streamId);
  }

  /**
   * Clean up resources for a session
   */
  async cleanupSession(sessionId: string) {
    const activeStreams = this.streamingManager.getAllActiveStreams();
    for (const [streamId, stream] of activeStreams.entries()) {
      if (stream.sessionId === sessionId) {
        await this.cancelStream(streamId);
      }
    }
    logger.info('Session cleanup completed', { sessionId });
  }

  /**
   * Handle Socket.IO chat request
   */
  async handleChatRequest(socket: any, data: {
    requestId: string;
    content: string;
    conversationId: string;
    model: string;
    parentMessageId?: string | null;
  }) {
    logger.info('Handling chat request', { socketId: socket.id, ...data });

    try {
      // Start the chat process
      await this.llmService.chat({
        sessionId: data.conversationId,
        message: data.content,
        parentMessageId: data.parentMessageId || undefined,
        callbacks: {
          onToken: (token: string) => {
            socket.emit('CHAT_RESPONSE_CHUNK', {
              requestId: data.requestId,
              chunk: token,
              done: false
            });
          },
          onComplete: () => {
            socket.emit('CHAT_RESPONSE_END', {
              requestId: data.requestId,
              done: true
            });
          },
          onError: (error: Error) => {
            socket.emit('CHAT_ERROR', {
              requestId: data.requestId,
              error: error.message
            });
          }
        }
      });
    } catch (error) {
      logger.error('Error in chat request:', error);
      socket.emit('CHAT_ERROR', {
        requestId: data.requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getOrCreateSession(sessionId?: string, userId?: string): Promise<string> {
    if (!sessionId) {
      sessionId = uuidv4();
    }

    // Check if session exists
    const existingSession = await this.redisMemory.getSession(sessionId);
    if (existingSession) {
      return sessionId;
    }

    // Create new session
    const newSession = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0
    };
    
    await this.redisMemory.setSession(sessionId, newSession);
    return sessionId;
  }
} 