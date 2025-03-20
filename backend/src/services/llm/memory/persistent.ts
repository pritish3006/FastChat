/**
 * DISABLED FILE - Skip TypeScript compilation
 * 
 * This file is temporarily disabled to focus on core functionality.
 */

// @ts-nocheck
/* eslint-disable */

import { BaseMessage } from '@langchain/core/messages';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';
import { Message, Session } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class PersistentStoreError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'PERSISTENT_STORE_ERROR', 500, context);
  }
}

export interface PersistentStoreConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  options?: {
    serviceRole?: boolean;
    noOp?: boolean;
  };
}

/**
 * No-op Persistent Store implementation
 * This is a temporary replacement that stores data in memory
 */
export class PersistentStore {
  private initialized: boolean = false;
  private inMemorySessions: Map<string, Session> = new Map();
  private inMemoryMessages: Map<string, Message> = new Map();

  constructor(private config: PersistentStoreConfig) {
    logger.info('PersistentStore initialized in no-op mode');
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    logger.info('Persistent store initialized (no-op mode)');
  }

  async storeMessage(message: Message): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    this.inMemoryMessages.set(message.id, message);
    logger.debug('Message stored (no-op):', { messageId: message.id });
  }

  async updateMessage(message: Message): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    this.inMemoryMessages.set(message.id, message);
    logger.debug('Message updated (no-op):', { messageId: message.id });
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    this.inMemoryMessages.delete(messageId);
    logger.debug('Message deleted (no-op):', { messageId });
  }

  async getMessages(
    sessionId: string,
    branchId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Message[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    let messages = Array.from(this.inMemoryMessages.values())
      .filter(msg => msg.sessionId === sessionId)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (branchId) {
      messages = messages.filter(msg => msg.branchId === branchId);
    }

    if (options.limit) {
      const start = options.offset || 0;
      messages = messages.slice(start, start + options.limit);
    }

    logger.debug('Messages retrieved (no-op):', { 
      sessionId, 
      count: messages.length 
    });

    return messages;
  }

  async getMessage(messageId: string): Promise<Message | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    const message = this.inMemoryMessages.get(messageId) || null;
    logger.debug('Message retrieved (no-op):', { 
      messageId, 
      found: !!message 
    });
    return message;
  }

  async getMessageCount(sessionId: string, branchId?: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    const count = Array.from(this.inMemoryMessages.values())
      .filter(msg => msg.sessionId === sessionId && (!branchId || msg.branchId === branchId))
      .length;
    logger.debug('Message count (no-op):', { sessionId, count });
    return count;
  }

  async getOrCreateSession(sessionId: string, userId?: string): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!sessionId || !userId) {
      throw new PersistentStoreError('sessionId and userId are required');
    }

    let session = this.inMemorySessions.get(sessionId);

    if (session) {
      logger.debug('Session found (no-op):', { sessionId });
      return session;
    }

    session = {
      id: sessionId,
      userId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      metadata: {},
      title: 'New Chat',
      model: 'default'
    };

    this.inMemorySessions.set(sessionId, session);
    logger.debug('Session created (no-op):', { sessionId });
    return session;
  }

  // LangChain compatibility methods
  async loadMemoryVariables(inputs: Record<string, any>): Promise<Record<string, any>> {
    const sessionId = inputs.sessionId;
    if (!sessionId) {
      return { chat_history: [], current_session: null };
    }

    const messages = await this.getMessages(sessionId);
    const session = await this.getOrCreateSession(sessionId, inputs.userId);

    return {
      chat_history: messages,
      current_session: session
    };
  }

  async saveContext(inputs: Record<string, any>, outputs: Record<string, any>): Promise<void> {
    const sessionId = inputs.sessionId;
    if (!sessionId) return;

    const message: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: inputs.input || '',
      timestamp: Date.now(),
      version: 1,
      metadata: { source: 'langchain' }
    };

    await this.storeMessage(message);

    if (outputs.output) {
      const response: Message = {
        id: uuidv4(),
        sessionId,
        role: 'assistant',
        content: outputs.output,
        timestamp: Date.now(),
        version: 1,
        metadata: { source: 'langchain', parentId: message.id }
      };

      await this.storeMessage(response);
    }
  }

  async clear(): Promise<void> {
    this.inMemoryMessages.clear();
    this.inMemorySessions.clear();
    logger.debug('Memory cleared (no-op)');
  }
}

// Export a factory function for easier instantiation
export function createPersistentStore(config: PersistentStoreConfig): PersistentStore {
  return new PersistentStore(config);
} 