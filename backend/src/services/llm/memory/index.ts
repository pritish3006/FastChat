import { Message, Session } from '../types';
import { RedisManager } from './redis';
import { ContextManager } from './context';
import { BranchManager } from './branch';
import { MemoryConfig } from './config';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';
import { RunnableSequence } from '@langchain/core/runnables';
import { trimMessages } from "@langchain/core/messages";

export class MemoryError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'MEMORY_ERROR', 500, context);
  }
}

export class MemoryManager {
  private redis: RedisManager;
  private contextManager: ContextManager;
  private branchManager: BranchManager;
  private config: MemoryConfig;
  private initialized: boolean = false;
  private useLangChain: boolean = false;
  private inMemoryMessages: Map<string, Message[]> = new Map();
  private inMemorySessions: Map<string, Session> = new Map();
  private messageProcessor: RunnableSequence | null = null;

  constructor(config: MemoryConfig) {
    this.redis = new RedisManager(config.redis);
    this.contextManager = new ContextManager(this.redis, config);
    this.branchManager = new BranchManager(this.redis);
    this.config = config;

    // Initialize LangChain if enabled
    if (config.langchain?.enabled) {
      this.useLangChain = true;
      
      if (config.langchain.memory?.useLangChainMemory && config.langchain?.model) {
        this.initializeLangChainMemory(config);
      }
    }

    logger.info('Memory manager initialized with configuration', {
      redisEnabled: true,
      langchainEnabled: this.useLangChain
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.redis.initialize();
    this.initialized = true;
  }

  async storeMessage(message: Message): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.redis.addMessage(message);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.redis.getMessage(messageId);
  }

  async getMessages(sessionId: string, branchId?: string): Promise<Message[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.redis.getMessages(sessionId, branchId);
  }

  async searchSimilarMessages(
    sessionId: string,
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      branchId?: string;
    } = {}
  ): Promise<Message[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      const results = await this.redis.getMessages(
        sessionId,
        undefined,
        { limit: options.limit || 5 }
      );
      
      const messages: Message[] = [];
      for (const result of results) {
        let message = await this.getMessage(result.id);
        if (message) {
          messages.push(message);
        }
      }
      
      return messages;
    } catch (error) {
      logger.error('Error searching similar messages:', error);
      return [];
    }
  }

  async assembleContext(
    sessionId: string,
    userMessage: string,
    options: {
      maxTokens?: number;
      maxMessages?: number;
      useSimilarity?: boolean;
      branchId?: string;
    } = {}
  ) {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.contextManager.assembleContext(
      sessionId,
      {
        maxTokens: options.maxTokens,
        maxMessages: options.maxMessages,
        branchId: options.branchId
      }
    );
  }

  getRedisManager(): RedisManager {
    return this.redis;
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getBranchManager(): BranchManager {
    return this.branchManager;
  }

  async cleanup(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }

  private initializeLangChainMemory(config: MemoryConfig): void {
    if (!config.langchain?.model) {
      throw new MemoryError('LangChain model is required for memory initialization');
    }

    const model = config.langchain.model;
    const maxTokens = config.langchain.memory?.maxMessages || 1000;

    // Create a message processor for windowed memory
    this.messageProcessor = RunnableSequence.from([
      (messages: BaseMessage[]) => messages,
      (messages: BaseMessage[]) => trimMessages(messages, {
        tokenCounter: (text) => Math.ceil(text.length / 4), // Simple approximation
        maxTokens,
        strategy: "last"
      })
    ]);

    logger.info('LangChain memory initialized', {
      maxTokens,
      model: model.toString()
    });
  }
}

// Export a factory function for easier instantiation
export function createMemoryManager(config: MemoryConfig): MemoryManager {
  return new MemoryManager(config);
} 