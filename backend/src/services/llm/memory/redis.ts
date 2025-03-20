import * as redis from 'redis';
import { Message, Session, RedisConfig, RedisManager } from '../types';
import logger from '../../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Re-export the RedisManager interface so it can be imported from this file
export type { RedisManager } from '../types';

/**
 * Redis-based implementation of memory management
 */
export class RedisMemory implements RedisManager {
  private client: redis.RedisClientType | null = null;
  private initialized = false;
  private readonly prefix: string;
  private readonly sessionTTL: number;

  constructor(private config: RedisConfig) {
    this.prefix = config.prefix || 'fast-chat:memory:';
    this.sessionTTL = config.sessionTTL || 24 * 60 * 60; // Default: 24 hours
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!this.config.enabled) {
        logger.info('Redis is disabled, operating in mock mode');
        this.initialized = true;
        return;
      }

      logger.info('Initializing Redis connection', { url: this.config.url });
      this.client = redis.createClient({
        url: this.config.url,
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err });
      });

      await this.client.connect();
      this.initialized = true;
      logger.info('Redis connection established successfully');
    } catch (err) {
      logger.error('Failed to initialize Redis', { error: err });
      this.client = null;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Redis memory is not initialized');
    }
  }

  private buildKey(type: string, id: string): string {
    return `${this.prefix}${type}:${id}`;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    this.ensureInitialized();
    
    try {
      const key = this.buildKey('session', sessionId);
      const data = await this.client?.get(key);
      
      if (!data) return null;
      
      return JSON.parse(data) as Session;
    } catch (err) {
      logger.error('Failed to get session', { error: err, sessionId });
      return null;
    }
  }

  async setSession(sessionId: string, session: Session): Promise<void> {
    this.ensureInitialized();
    
    try {
      const key = this.buildKey('session', sessionId);
      await this.client?.set(key, JSON.stringify(session), {
        EX: this.sessionTTL
      });
    } catch (err) {
      logger.error('Failed to set session', { error: err, sessionId });
    }
  }

  async updateSession(sessionId: string, update: Partial<Session>): Promise<void> {
    this.ensureInitialized();
    
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      const updatedSession = {
        ...session,
        ...update,
        lastAccessedAt: Date.now()
      };
      
      await this.setSession(sessionId, updatedSession);
    } catch (err) {
      logger.error('Failed to update session', { error: err, sessionId });
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const key = this.buildKey('session', sessionId);
      await this.client?.del(key);
      
      // Delete associated messages
      const messagesKey = this.buildKey('messages', sessionId);
      const messageIds = await this.client?.sMembers(messagesKey);
      
      if (messageIds && messageIds.length > 0) {
        const messageKeys = messageIds.map(id => this.buildKey('message', id));
        await this.client?.del(messageKeys);
        await this.client?.del(messagesKey);
      }
    } catch (err) {
      logger.error('Failed to delete session', { error: err, sessionId });
    }
  }

  async getMessage(messageId: string): Promise<Message | null> {
    this.ensureInitialized();
    
    try {
      const key = this.buildKey('message', messageId);
      const data = await this.client?.get(key);
      
      if (!data) return null;

      return JSON.parse(data) as Message;
    } catch (err) {
      logger.error('Failed to get message', { error: err, messageId });
      return null;
    }
  }

  async getMessages(sessionId: string, branchId?: string): Promise<Message[]> {
    this.ensureInitialized();
    
    try {
      const messagesKey = this.buildKey('messages', sessionId);
      const messageIds = await this.client?.sMembers(messagesKey) || [];
      
      const messages: Message[] = [];
      
      for (const id of messageIds) {
        const message = await this.getMessage(id);
        if (message && (!branchId || message.branchId === branchId)) {
          messages.push(message);
        }
      }
      
      // Sort by createdAt timestamp
      return messages.sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      logger.error('Failed to get messages', { error: err, sessionId });
      return [];
    }
  }

  async storeMessage(message: Message): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Ensure message has an ID
      if (!message.id) {
        message.id = uuidv4();
      }
      
      // Ensure message has a createdAt timestamp
      if (!message.createdAt) {
        message.createdAt = Date.now();
      }
      
      const key = this.buildKey('message', message.id);
      await this.client?.set(key, JSON.stringify(message), {
        EX: this.sessionTTL
      });
      
      // Add to session's message set
      const messagesKey = this.buildKey('messages', message.sessionId);
      await this.client?.sAdd(messagesKey, message.id);
      await this.client?.expire(messagesKey, this.sessionTTL);
      
      // Update session message count
      const session = await this.getSession(message.sessionId);
      if (session) {
        await this.updateSession(message.sessionId, {
          messageCount: (session.messageCount || 0) + 1,
          lastAccessedAt: Date.now()
        });
      }
    } catch (err) {
      logger.error('Failed to store message', { error: err, messageId: message.id });
    }
  }

  async updateMessage(messageId: string, update: Partial<Message>): Promise<void> {
    this.ensureInitialized();
    
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }
      
      const updatedMessage = {
        ...message,
        ...update
      };
      
      const key = this.buildKey('message', messageId);
      await this.client?.set(key, JSON.stringify(updatedMessage), {
        EX: this.sessionTTL
      });
    } catch (err) {
      logger.error('Failed to update message', { error: err, messageId });
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Get message to get session ID
      const message = await this.getMessage(messageId);
      if (!message) return;
      
      // Delete message
      const key = this.buildKey('message', messageId);
      await this.client?.del(key);
      
      // Remove from session's message set
      const messagesKey = this.buildKey('messages', message.sessionId);
      await this.client?.sRem(messagesKey, messageId);
      
      // Update session message count
      const session = await this.getSession(message.sessionId);
      if (session && session.messageCount > 0) {
        await this.updateSession(message.sessionId, {
          messageCount: session.messageCount - 1
        });
      }
    } catch (err) {
      logger.error('Failed to delete message', { error: err, messageId });
    }
  }
}

// Export a factory function for easier instantiation
export function createRedisMemory(config: RedisConfig): RedisMemory {
  return new RedisMemory(config);
} 