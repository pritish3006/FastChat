/**
 * Memory extensions
 * 
 * Type-safe extensions to the memory manager for use with LangChain and the LLM service.
 * Provides additional methods needed by consumers without modifying the core class.
 */

import { MemoryManager } from './index';
import { RedisManager } from './redis';
import { VectorStore } from './vector';
import { EmbeddingService } from './embedding';
import { Message } from '../types';
import logger from '../../../utils/logger';

/**
 * Enhanced versions of MemoryManager methods with proper typing
 */
export class EnhancedMemoryManager {
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Add a message to memory (alias for storeMessage)
   */
  async addMessage(message: Message): Promise<void> {
    return this.memoryManager.storeMessage(message);
  }

  /**
   * Get the Redis manager
   */
  getRedisManager(): RedisManager {
    // @ts-expect-error - Accessing private field
    return this.memoryManager.redis;
  }

  /**
   * Get the vector store
   */
  getVectorStore(): VectorStore | undefined {
    // @ts-expect-error - Accessing private field
    return this.memoryManager.config.vectorStore;
  }

  /**
   * Get the embedding service
   */
  getEmbeddingService(): EmbeddingService | undefined {
    // @ts-expect-error - Accessing private field
    return this.memoryManager.embeddingService;
  }

  /**
   * Find similar messages using vector similarity
   */
  async findSimilarMessages(
    sessionId: string,
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      includeBranches?: boolean;
    } = {}
  ): Promise<Message[]> {
    try {
      return this.memoryManager.searchSimilarMessages(sessionId, query, {
        limit: options.limit || 5,
        threshold: options.threshold || 0.7,
        branchId: options.includeBranches ? undefined : undefined
      });
    } catch (error) {
      logger.error(`Error finding similar messages: ${error}`, { sessionId });
      return [];
    }
  }

  /**
   * Delegate all other calls to the memory manager
   */
  async getMessage(messageId: string): Promise<Message | null> {
    return this.memoryManager.getMessage(messageId);
  }

  async getMessages(sessionId: string, branchId?: string): Promise<Message[]> {
    return this.memoryManager.getMessages(sessionId, branchId);
  }

  async storeMessage(message: Message): Promise<void> {
    return this.memoryManager.storeMessage(message);
  }

  async assembleContext(
    sessionId: string,
    userMessage: string,
    options: any = {}
  ): Promise<any> {
    return this.memoryManager.assembleContext(sessionId, userMessage, options);
  }

  getContextManager(): any {
    // @ts-expect-error - Accessing private field
    return this.memoryManager.contextManager;
  }

  getBranchManager(): any {
    // @ts-expect-error - Accessing private field
    return this.memoryManager.branchManager;
  }

  async initialize(): Promise<void> {
    return this.memoryManager.initialize();
  }

  async cleanup(): Promise<void> {
    return this.memoryManager.cleanup();
  }
}

/**
 * Create an enhanced memory manager from a regular one
 */
export function enhanceMemoryManager(memoryManager: MemoryManager): EnhancedMemoryManager {
  return new EnhancedMemoryManager(memoryManager);
} 