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
import { RedisManager } from './memory/redis';
import { StreamingManager } from './streaming';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../../utils/logger';
import type { Subscribable } from '@trpc/server/observable';
import type { WebSocket } from 'ws';

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
  private redisManager: RedisManager;
  private streamingManager: StreamingManager;

  constructor(llmService: LLMService, redisManager: RedisManager) {
    this.llmService = llmService;
    this.redisManager = redisManager;
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
} 