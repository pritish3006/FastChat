import Redis, { RedisOptions } from 'ioredis';
import { RedisConfig } from './config';
import { withRetry } from '../utils/retry';
import { LLMServiceError } from '../errors';
import { Message, Session } from '../types';

export class RedisConnectionError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'REDIS_CONNECTION_ERROR', 500, context);
  }
}

export class RedisManager {
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
  };

  constructor(config: RedisConfig) {
    this.config = config;
    this.keyPrefix = config.prefix || 'fast-chat:memory:';
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      this.client = await this.createClient();
      
      // Set up error handling
      this.client.on('error', (error) => {
        throw new RedisConnectionError('Redis client error', { error });
      });

      // Test connection
      await this.ping();
    } catch (error) {
      throw new RedisConnectionError('Failed to initialize Redis', { error });
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

  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.client) throw new RedisConnectionError('Redis client not initialized');

    const key = this.keys.session(sessionId);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
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

  // Utility Methods
  async ping(): Promise<boolean> {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }

    try {
      const result = await withRetry(
        () => this.client!.ping(),
        {
          maxAttempts: this.config.maxRetries,
          baseDelay: this.config.retryTimeout,
        }
      );
      return result === 'PONG';
    } catch (error) {
      throw new RedisConnectionError('Redis ping failed', { error });
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new RedisConnectionError('Redis client not initialized');
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
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
} 