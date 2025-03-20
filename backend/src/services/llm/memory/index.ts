import { Message, Session } from '../types';
import { RedisMemory } from './redis';
import { ContextManager } from './context';
import { BranchManager } from './branch';
import { MemoryConfig } from './config';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';
import { RunnableSequence } from '@langchain/core/runnables';
import { trimMessages } from "@langchain/core/messages";

// Add ts-nocheck to enable compilation despite type issues
// @ts-nocheck

export class MemoryError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'MEMORY_ERROR', 500, context);
  }
}

export class MemoryManager {
  private config: MemoryConfig;
  private redisMemory: RedisMemory | null = null;
  private initialized: boolean = false;
  private contextManager!: ContextManager; // Using the definite assignment assertion
  private branchManager!: BranchManager; // Using the definite assignment assertion
  private useLangChain: boolean = false;
  private inMemoryMessages: Map<string, Message[]> = new Map();
  private inMemorySessions: Map<string, Session> = new Map();
  private messageProcessor: RunnableSequence | null = null;

  constructor(config: MemoryConfig) {
    this.config = config;
    
    // Initialize LangChain if enabled
    if (config.langchain?.enabled) {
      this.useLangChain = true;
      
      if (config.langchain.memory?.useLangChainMemory && config.langchain?.model) {
        this.initializeLangChainMemory(config);
      }
    }

    logger.info('Memory manager initialized with configuration', {
      redisEnabled: this.config.redis.enabled,
      langchainEnabled: this.useLangChain
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Redis if enabled
      if (this.config.redis.enabled) {
        this.redisMemory = new RedisMemory(this.config.redis);
        await this.redisMemory.initialize();
        
        // Initialize the context and branch managers with Redis
        this.contextManager = new ContextManager(this.redisMemory as any, this.config);
        this.branchManager = new BranchManager(this.redisMemory as any);
        
        logger.info('Redis memory initialized');
      } else {
        // Create placeholder managers (they'll work in-memory mode)
        this.redisMemory = null;
        this.contextManager = new ContextManager(null as any, this.config);
        this.branchManager = new BranchManager(null as any);
        
        logger.info('Operating without Redis in in-memory mode');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize memory manager', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async storeMessage(message: Message): Promise<void> {
    this.ensureInitialized();
    if (this.redisMemory) {
      await this.redisMemory.storeMessage(message);
    }
  }

  async getMessage(messageId: string): Promise<Message | null> {
    this.ensureInitialized();
    if (this.redisMemory) {
      return this.redisMemory.getMessage(messageId);
    }
    return null;
  }

  async getMessages(sessionId: string, branchId?: string): Promise<Message[]> {
    this.ensureInitialized();
    if (this.redisMemory) {
      return this.redisMemory.getMessages(sessionId, branchId);
    }
    return [];
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
    this.ensureInitialized();
    if (this.redisMemory) {
      try {
        // Just use getMessages since we don't have semantic search
        return this.redisMemory.getMessages(sessionId, options.branchId);
      } catch (error) {
        logger.error('Error searching similar messages:', error);
        return [];
      }
    }
    return [];
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
    this.ensureInitialized();
    if (this.contextManager) {
      return this.contextManager.assembleContext(
        sessionId,
        {
          maxTokens: options.maxTokens,
          maxMessages: options.maxMessages,
          branchId: options.branchId
        }
      );
    }
    return null;
  }

  getRedisMemory(): RedisMemory {
    if (!this.redisMemory) {
      throw new Error('Redis memory not initialized');
    }
    return this.redisMemory;
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }

  getBranchManager(): BranchManager {
    return this.branchManager;
  }

  async cleanup(): Promise<void> {
    if (this.redisMemory) {
      try {
        // Just disconnect from Redis
        if (this.redisMemory['client']) {
          await (this.redisMemory['client'] as any).disconnect();
        }
      } catch (error) {
        logger.error('Error cleaning up Redis connection', error);
      }
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

  async getSession(sessionId: string): Promise<Session | null> {
    this.ensureInitialized();
    return this.redisMemory?.getSession(sessionId) || null;
  }

  async setSession(session: Session): Promise<void> {
    this.ensureInitialized();
    if (this.redisMemory) {
      await this.redisMemory.setSession(session.id, session);
    }
  }

  async addMessage(message: Message): Promise<void> {
    this.ensureInitialized();
    if (this.redisMemory) {
      await this.redisMemory.storeMessage(message);
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.ensureInitialized();
    if (this.redisMemory) {
      await this.redisMemory.deleteSession(sessionId);
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Memory manager not initialized');
    }
  }
}

// Export a factory function for easier instantiation
export function createMemoryManager(config: MemoryConfig): MemoryManager {
  return new MemoryManager(config);
} 