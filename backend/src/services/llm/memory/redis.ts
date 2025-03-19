import Redis, { RedisOptions } from 'ioredis';
import { RedisConfig } from './config';
import { withRetry } from '../utils/retry';
import { LLMServiceError } from '../errors';
import { Message, Session } from '../types';
import { BaseMemory, InputValues, OutputValues } from '@langchain/core/memory';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class RedisConnectionError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'REDIS_CONNECTION_ERROR', 500, context);
  }
}

export class RedisManager extends BaseMemory {
  private client: Redis | null = null;
  private config: RedisConfig;
  private readonly keyPrefix: string;

  // Key patterns for different data types
  private readonly keys = {
    session: (id: string) => `${this.keyPrefix}session:${id}`,
    messages: (sessionId: string) => `${this.keyPrefix}messages:${sessionId}`,
    messageData: (messageId: string) => `${this.keyPrefix}message:${messageId}`,
    branch: (branchId: string) => `${this.keyPrefix}branch:${branchId}`,
    branchMessages: (branchId: string) => `${this.keyPrefix}branch:${branchId}:messages`,
    lock: (key: string) => `${this.keyPrefix}lock:${key}`,
    processingQueue: (sessionId: string) => `${this.keyPrefix}queue:${sessionId}`,
    messageVersions: (messageId: string) => `${this.keyPrefix}messageVersions:${messageId}`,
    branchHistory: (sessionId: string) => `${this.keyPrefix}branchHistory:${sessionId}`,
  };

  constructor(config: RedisConfig) {
    super();
    this.config = config;
    this.keyPrefix = config.prefix || 'fast-chat:memory:';
  }

  /**
   * Get memory variables
   */
  get memoryKeys(): string[] {
    return ['chat_history', 'current_session', 'branches'];
  }

  /**
   * Load memory variables
   */
  async loadMemoryVariables(inputs: InputValues): Promise<Record<string, any>> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const sessionId = inputs.sessionId as string;
    if (!sessionId) {
      return { chat_history: [], current_session: null, branches: [] };
    }

    try {
      // Get messages for the session
      const messages = await this.getMessages(sessionId);
      
      // Convert to LangChain message types
      const chatHistory = messages.map(msg => 
        msg.role === 'user' ? new HumanMessage(msg.content) :
        msg.role === 'assistant' ? new AIMessage(msg.content) :
        new SystemMessage(msg.content)
      );

      // Get session info
      const session = await this.getSession(sessionId);

      // Get branches
      const branches = await this.getBranches(sessionId);

      return {
        chat_history: chatHistory,
        current_session: session,
        branches: branches
      };
    } catch (error) {
      logger.error('Error loading memory variables:', error);
      return { chat_history: [], current_session: null, branches: [] };
    }
  }

  /**
   * Save context from this conversation to buffer
   */
  async saveContext(
    inputs: InputValues,
    outputs: OutputValues
  ): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const sessionId = inputs.sessionId as string;
    if (!sessionId) {
      throw new RedisConnectionError('sessionId is required in inputs');
    }

    try {
      // Convert inputs to message format
      const inputMessage: Message = {
        id: inputs.messageId as string || uuidv4(),
        sessionId,
        role: 'user' as const,
        content: inputs.input as string,
        timestamp: Date.now(),
        version: 1,
        metadata: {
          tokens: (inputs.input as string).split(' ').length,
          model: 'langchain',
          persistedAt: Date.now()
        }
      };

      // Convert outputs to message format
      const outputMessage: Message = {
        id: outputs.messageId as string || uuidv4(),
        sessionId,
        role: 'assistant' as const,
        content: outputs.output as string,
        timestamp: Date.now(),
        version: 1,
        metadata: {
          tokens: (outputs.output as string).split(' ').length,
          model: 'langchain',
          persistedAt: Date.now()
        }
      };

      // Store messages
      await this.addMessage(inputMessage);
      await this.addMessage(outputMessage);

      // Get current session and update it
      const session = await this.getSession(sessionId);
      if (session) {
        session.messageCount += 2; // Added two messages
        session.lastAccessedAt = Date.now();
        await this.updateSession(sessionId, session);
      } else {
        // Create new session if it doesn't exist
        const newSession: Session = {
          id: sessionId,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          messageCount: 2,
          branches: [],
          modelId: 'langchain',
          modelConfig: {
            provider: 'langchain',
            modelId: 'langchain'
          }
        };
        await this.setSession(newSession);
      }
    } catch (error) {
      logger.error('Error saving context:', error);
      throw new RedisConnectionError('Failed to save context', { error });
    }
  }

  /**
   * Clear memory contents
   */
  async clear(): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    try {
      // Clear all keys with the prefix
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.error('Error clearing memory:', error);
      throw new RedisConnectionError('Failed to clear memory', { error });
    }
  }

  private async connect(): Promise<void> {
    if (this.client) {
      logger.debug('Redis client already initialized');
      return;
    }

    if (!this.config.enabled) {
      logger.debug('Redis is disabled, skipping connection');
      return;
    }

    try {
      this.client = await this.createClient();

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.client) {
          reject(new RedisConnectionError('Redis client not initialized'));
          return;
        }

        this.client.once('ready', () => {
          logger.info('Redis client ready');
          resolve();
        });

        this.client.once('error', (error) => {
          reject(new RedisConnectionError('Failed to connect to Redis', { error }));
        });

        // Set up ongoing error handling
        this.client.on('error', (error) => {
          logger.error('Redis client error:', error);
        });
      });

      // Test connection
      await this.ping();
      logger.info('Successfully connected to Redis');
    } catch (error) {
      this.client = null;
      throw new RedisConnectionError('Failed to connect to Redis', { error });
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      logger.info('Successfully disconnected from Redis');
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.connect();
      
      // Verify connection is working
      if (this.client) {
        await this.ping();
        logger.info('Redis initialization complete');
      } else if (this.config.enabled) {
        throw new RedisConnectionError('Redis client failed to initialize');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw new RedisConnectionError('Redis initialization failed', { error });
    }
  }

  private async createClient(): Promise<Redis> {
    const { url, maxRetries, retryTimeout, enabled, prefix, ...redisOptions } = this.config;

    const options: RedisOptions = {
      ...redisOptions,
      retryStrategy: (times: number) => {
        if (times > (maxRetries || 3)) {
          return null; // Stop retrying
        }
        return retryTimeout || 1000; // Time between retries
      },
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
    };

    return url ? new Redis(url) : new Redis(options);
  }

  private async ping(): Promise<void> {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }

    try {
      const result = await this.client.ping();
      if (result !== 'PONG') {
        throw new RedisConnectionError('Invalid response from Redis ping');
      }
      logger.debug('Redis ping successful');
    } catch (error) {
      logger.error('Redis ping failed:', error);
      throw new RedisConnectionError('Failed to ping Redis server', { error });
    }
  }

  // Session Management
  async setSession(session: Session): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const key = this.keys.session(session.id);
    await this.client.setex(
      key,
      this.config.sessionTTL || 24 * 60 * 60, // Default 24 hours
      JSON.stringify(session)
    );
  }

  async updateSession(sessionId: string, session: Session): Promise<void> {
    return this.setSession(session);
  }

  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    try {
      const data = await this.client.get(this.keys.session(sessionId));
      if (!data) return null;

      const session = JSON.parse(data);
      return {
        id: session.id,
        createdAt: session.createdAt,
        lastAccessedAt: session.lastAccessedAt,
        messageCount: session.messageCount || 0,
        branches: session.branches || [],
        modelId: session.modelId || session.model || 'langchain', // Support legacy sessions
        modelConfig: session.modelConfig || {
          provider: 'langchain',
          modelId: session.modelId || session.model || 'langchain'
        }
      };
    } catch (error) {
      logger.error('Error getting session from Redis:', error);
      return null;
    }
  }

  // Message Management
  async addMessage(message: Message): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    // Acquire lock for message processing
    const lockKey = this.keys.lock(`message:${message.sessionId}`);
    const acquired = await this.acquireLock(message.sessionId, 5000); // 5 second timeout

    if (!acquired) {
      throw new RedisConnectionError('Failed to acquire lock for message processing');
    }

    try {
      // Store message data
      const messageKey = this.keys.messageData(message.id);
      await this.client.setex(
        messageKey,
        this.config.sessionTTL || 24 * 60 * 60,
        JSON.stringify(message)
      );

      // Add to session message list with score as timestamp for ordering
      const messagesKey = this.keys.messages(message.sessionId);
      await this.client.zadd(messagesKey, message.timestamp, message.id);

      // If part of a branch, add to branch message list
      if (message.branchId) {
        const branchMessagesKey = this.keys.branchMessages(message.branchId);
        await this.client.zadd(branchMessagesKey, message.timestamp, message.id);
      }

      // Add to processing queue if needed
      if (message.role === 'user') {
        const queueKey = this.keys.processingQueue(message.sessionId);
        await this.client.rpush(queueKey, message.id);
      }
    } finally {
      // Release lock
      await this.releaseLock(message.sessionId);
    }
  }

  // Wrapper for addMessage to maintain API compatibility
  async storeMessage(message: Message): Promise<void> {
    return this.addMessage(message);
  }

  async getMessage(messageId: string): Promise<Message | null> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');
    
    const messageKey = this.keys.messageData(messageId);
    const data = await this.client.get(messageKey);
    return data ? JSON.parse(data) : null;
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');
    
    // Get the message to find out what session and branch it belongs to
    const message = await this.getMessage(messageId);
    if (!message) return; // Message doesn't exist, nothing to delete
    
    const messageKey = this.keys.messageData(messageId);
    
    // Start a transaction
    const pipeline = this.client.pipeline();
    
    // Delete the message data
    pipeline.del(messageKey);
    
    // Remove from session message list
    if (message.sessionId) {
      const messagesKey = this.keys.messages(message.sessionId);
      pipeline.zrem(messagesKey, messageId);
    }
    
    // Remove from branch message list if applicable
    if (message.branchId) {
      const branchMessagesKey = this.keys.branchMessages(message.branchId);
      pipeline.zrem(branchMessagesKey, messageId);
    }
    
    // Execute the transaction
    await pipeline.exec();
  }

  async getMessages(
    sessionId: string,
    branchId?: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Message[]> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const key = branchId ? 
      this.keys.branchMessages(branchId) : 
      this.keys.messages(sessionId);

    // Get message IDs ordered by timestamp
    const messageIds = await this.client.zrange(
      key,
      options.offset || 0,
      options.limit ? (options.offset || 0) + options.limit - 1 : -1
    );

    // Fetch all message data in parallel
    const messagePromises = messageIds.map(id =>
      this.client!.get(this.keys.messageData(id))
    );

    const messageData = await Promise.all(messagePromises);
    return messageData
      .filter((data): data is string => data !== null)
      .map(data => JSON.parse(data));
  }

  // Concurrency Management
  private async acquireLock(
    sessionId: string,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const lockKey = this.keys.lock(`session:${sessionId}`);
    const acquired = await this.client.set(
      lockKey,
      '1',
      'EX',
      Math.ceil(timeoutMs / 1000),
      'NX'
    );

    return acquired === 'OK';
  }

  private async releaseLock(sessionId: string): Promise<void> {
    if (!this.client) return;
    const lockKey = this.keys.lock(`session:${sessionId}`);
    await this.client.del(lockKey);
  }

  // Simplified Message Processing
  async processMessage(message: Message): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    // Try to acquire session lock
    const locked = await this.acquireLock(message.sessionId);
    if (!locked) {
      throw new RedisConnectionError('Session is busy, please try again');
    }

    try {
      // Store message
      const messageKey = this.keys.messageData(message.id);
      await this.client.setex(
        messageKey,
        this.config.sessionTTL || 24 * 60 * 60,
        JSON.stringify(message)
      );

      // Add to session timeline
      const messagesKey = this.keys.messages(message.sessionId);
      await this.client.zadd(messagesKey, message.timestamp, message.id);

      // Handle branching if needed
      if (message.branchId) {
        const branchMessagesKey = this.keys.branchMessages(message.branchId);
        await this.client.zadd(branchMessagesKey, message.timestamp, message.id);
      }

      // Update session metadata
      const session = await this.getSession(message.sessionId);
      if (session) {
        session.messageCount++;
        session.lastAccessedAt = Date.now();
        await this.setSession(session);
      }
    } finally {
      await this.releaseLock(message.sessionId);
    }
  }

  // Queue Management
  async addToProcessingQueue(sessionId: string, messageId: string): Promise<void> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');
    
    const queueKey = this.keys.processingQueue(sessionId);
    await this.client.rpush(queueKey, messageId);
  }

  async getNextMessageFromQueue(sessionId: string): Promise<string | null> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');
    
    const queueKey = this.keys.processingQueue(sessionId);
    return this.client.lpop(queueKey);
  }

  // Branch Management
  async getBranches(sessionId: string): Promise<any[]> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');
    
    const branchHistoryKey = this.keys.branchHistory(sessionId);
    const branchIds = await this.client.smembers(branchHistoryKey);
    
    const branchPromises = branchIds.map(id =>
      this.client!.get(this.keys.branch(id))
    );

    const branchData = await Promise.all(branchPromises);
    return branchData
      .filter((data): data is string => data !== null)
      .map(data => JSON.parse(data));
  }

  getClient(): Redis {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }
    return this.client;
  }

  buildKey(type: keyof typeof this.keys, id: string): string {
    const keyFn = this.keys[type];
    return keyFn ? keyFn(id) : `${this.keyPrefix}${type}:${id}`;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }
    return (await this.client.exists(key)) === 1;
  }

  /**
   * Set a key with TTL
   */
  async set(key: string, value: string, ttl: number): Promise<void> {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }
    await this.client.setex(key, ttl, value);
  }
}

// Export a factory function for easier instantiation
export function createRedisManager(config: RedisConfig): RedisManager {
  return new RedisManager(config);
} 