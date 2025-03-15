import { RedisManager } from '../memory/redis';
import { TokenCounter } from './counter';
import { Message } from '../types';
import { LLMServiceError } from '../errors';

export class TokenTrackerError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'TOKEN_TRACKER_ERROR', 500, context);
  }
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  windows?: {
    hour: number;
    day: number;
    month: number;
  };
}

export interface TrackerOptions {
  enableRateLimiting?: boolean;
  rateLimits?: {
    userHourly?: number;
    userDaily?: number;
    userMonthly?: number;
    sessionTotal?: number;
  };
}

/**
 * Tracks token usage across different levels (message, session, user)
 * Uses Redis for fast lookups and caching
 */
export class TokenTracker {
  private redis: RedisManager;
  private counter: TokenCounter;
  private options: TrackerOptions;
  
  constructor(
    redis: RedisManager, 
    counter: TokenCounter,
    options: TrackerOptions = {}
  ) {
    this.redis = redis;
    this.counter = counter;
    this.options = options;
  }

  /**
   * Count tokens in a message and store the count
   */
  async trackMessageTokens(
    message: Message, 
    model?: string
  ): Promise<Message> {
    const tokenCount = await this.counter.countTokens(message.content, { model });
    
    // Update message metadata with token count
    const updatedMessage: Message = {
      ...message,
      metadata: {
        ...message.metadata,
        tokens: tokenCount
      }
    };
    
    return updatedMessage;
  }

  /**
   * Track tokens for a session
   */
  async trackSessionTokens(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
    model?: string
  ): Promise<TokenUsage> {
    if (!this.redis) {
      throw new TokenTrackerError('Redis not available for token tracking');
    }
    
    const client = this.redis.getClient();
    const sessionKey = `tokens:session:${sessionId}`;
    const timestamp = Date.now();
    
    // Increment token counts atomically
    await client.hincrby(sessionKey, 'prompt', promptTokens);
    await client.hincrby(sessionKey, 'completion', completionTokens);
    await client.hset(sessionKey, 'last_update', timestamp.toString());
    await client.hset(sessionKey, 'model', model || 'unknown');
    
    // Set expiry if not already set
    await client.expire(sessionKey, 60 * 60 * 24 * 30); // 30 days
    
    // Get updated totals
    const promptTotal = parseInt(await client.hget(sessionKey, 'prompt') || '0');
    const completionTotal = parseInt(await client.hget(sessionKey, 'completion') || '0');
    
    return {
      prompt: promptTotal,
      completion: completionTotal,
      total: promptTotal + completionTotal
    };
  }

  /**
   * Track tokens for a user
   */
  async trackUserTokens(
    userId: string,
    promptTokens: number,
    completionTokens: number,
    model?: string
  ): Promise<TokenUsage> {
    if (!this.redis) {
      throw new TokenTrackerError('Redis not available for token tracking');
    }
    
    const client = this.redis.getClient();
    const userKey = `tokens:user:${userId}`;
    const date = new Date();
    const hourKey = `${userKey}:hour:${date.toISOString().slice(0, 13)}`;
    const dayKey = `${userKey}:day:${date.toISOString().slice(0, 10)}`;
    const monthKey = `${userKey}:month:${date.toISOString().slice(0, 7)}`;
    
    // Update total usage
    await client.hincrby(userKey, 'prompt', promptTokens);
    await client.hincrby(userKey, 'completion', completionTokens);
    
    // Update time-window usage
    await client.hincrby(hourKey, 'total', promptTokens + completionTokens);
    await client.hincrby(dayKey, 'total', promptTokens + completionTokens);
    await client.hincrby(monthKey, 'total', promptTokens + completionTokens);
    
    // Set expiries
    await client.expire(hourKey, 60 * 60 * 2); // 2 hours
    await client.expire(dayKey, 60 * 60 * 24 * 2); // 2 days
    await client.expire(monthKey, 60 * 60 * 24 * 32); // ~1 month
    
    // Get updated totals
    const promptTotal = parseInt(await client.hget(userKey, 'prompt') || '0');
    const completionTotal = parseInt(await client.hget(userKey, 'completion') || '0');
    const hourlyUsage = parseInt(await client.hget(hourKey, 'total') || '0');
    const dailyUsage = parseInt(await client.hget(dayKey, 'total') || '0');
    const monthlyUsage = parseInt(await client.hget(monthKey, 'total') || '0');
    
    return {
      prompt: promptTotal,
      completion: completionTotal,
      total: promptTotal + completionTotal,
      windows: {
        hour: hourlyUsage,
        day: dailyUsage,
        month: monthlyUsage
      }
    };
  }

  /**
   * Get token usage for a session
   */
  async getSessionTokenUsage(sessionId: string): Promise<TokenUsage> {
    if (!this.redis) {
      throw new TokenTrackerError('Redis not available for token tracking');
    }
    
    const client = this.redis.getClient();
    const sessionKey = `tokens:session:${sessionId}`;
    
    const data = await client.hgetall(sessionKey);
    
    if (!data || Object.keys(data).length === 0) {
      return { prompt: 0, completion: 0, total: 0 };
    }
    
    const promptTokens = parseInt(data.prompt || '0');
    const completionTokens = parseInt(data.completion || '0');
    
    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  /**
   * Get token usage for a user
   */
  async getUserTokenUsage(userId: string): Promise<TokenUsage> {
    if (!this.redis) {
      throw new TokenTrackerError('Redis not available for token tracking');
    }
    
    const client = this.redis.getClient();
    const userKey = `tokens:user:${userId}`;
    const date = new Date();
    const hourKey = `${userKey}:hour:${date.toISOString().slice(0, 13)}`;
    const dayKey = `${userKey}:day:${date.toISOString().slice(0, 10)}`;
    const monthKey = `${userKey}:month:${date.toISOString().slice(0, 7)}`;
    
    const [userData, hourData, dayData, monthData] = await Promise.all([
      client.hgetall(userKey),
      client.hgetall(hourKey),
      client.hgetall(dayKey),
      client.hgetall(monthKey)
    ]);
    
    const promptTokens = parseInt(userData?.prompt || '0');
    const completionTokens = parseInt(userData?.completion || '0');
    const hourlyUsage = parseInt(hourData?.total || '0');
    const dailyUsage = parseInt(dayData?.total || '0');
    const monthlyUsage = parseInt(monthData?.total || '0');
    
    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
      windows: {
        hour: hourlyUsage,
        day: dailyUsage,
        month: monthlyUsage
      }
    };
  }

  /**
   * Check if a user has exceeded rate limits
   */
  async checkRateLimits(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    usage: TokenUsage;
  }> {
    if (!this.options.enableRateLimiting) {
      return { allowed: true, usage: { prompt: 0, completion: 0, total: 0 } };
    }
    
    const usage = await this.getUserTokenUsage(userId);
    const limits = this.options.rateLimits || {};
    
    if (limits.userHourly && usage.windows && usage.windows.hour >= limits.userHourly) {
      return {
        allowed: false,
        reason: 'Hourly rate limit exceeded',
        usage
      };
    }
    
    if (limits.userDaily && usage.windows && usage.windows.day >= limits.userDaily) {
      return {
        allowed: false,
        reason: 'Daily rate limit exceeded',
        usage
      };
    }
    
    if (limits.userMonthly && usage.windows && usage.windows.month >= limits.userMonthly) {
      return {
        allowed: false,
        reason: 'Monthly rate limit exceeded',
        usage
      };
    }
    
    return { allowed: true, usage };
  }
} 