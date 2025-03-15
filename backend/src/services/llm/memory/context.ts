import { Message, Context } from '../types';
import { RedisManager } from './redis';
import { MemoryConfig } from './config';
import { LLMServiceError } from '../errors';

export class ContextWindowError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONTEXT_WINDOW_ERROR', 400, context);
  }
}

interface ContextOptions {
  maxMessages?: number;
  maxTokens?: number;
  includeSystemPrompt?: boolean;
  preferRecentMessages?: boolean;
  branchId?: string;
}

/**
 * Manages the context window for LLM interactions
 * Handles selecting relevant messages, token budgeting, and context assembly
 */
export class ContextManager {
  private redis: RedisManager;
  private config: MemoryConfig;

  constructor(redis: RedisManager, config: MemoryConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Assembles a context window for a session
   * Prioritizes recent messages, system prompts, and branch-specific messages
   */
  async assembleContext(
    sessionId: string,
    options: ContextOptions = {}
  ): Promise<Context> {
    // Set defaults from config
    const maxMessages = options.maxMessages || this.config.defaults.maxContextSize;
    const includeSystemPrompt = options.includeSystemPrompt !== false;
    const branchId = options.branchId;

    // Get session messages (possibly from a specific branch)
    const messages = await this.redis.getMessages(
      sessionId,
      branchId,
      { limit: maxMessages + 5 } // Fetch a few extra for selection flexibility
    );

    if (messages.length === 0) {
      return {
        messages: [],
        metadata: {
          sessionId,
          branchId,
          tokenCount: 0,
          messageCount: 0
        }
      };
    }

    // Extract system prompt if present and needed
    let systemPrompt: string | undefined;
    let contextMessages: Message[] = [];

    if (includeSystemPrompt) {
      const systemMessages = messages.filter(m => m.role === 'system');
      if (systemMessages.length > 0) {
        // Use the latest system message
        const latestSystem = systemMessages.reduce((latest, current) => 
          current.timestamp > latest.timestamp ? current : latest
        );
        systemPrompt = latestSystem.content;
        
        // Remove system messages from the context to avoid duplication
        contextMessages = messages.filter(m => m.role !== 'system');
      } else {
        contextMessages = messages;
      }
    } else {
      contextMessages = messages;
    }

    // Apply context window constraints
    let selectedMessages = this.applyContextConstraints(
      contextMessages, 
      maxMessages,
      options.maxTokens,
      options.preferRecentMessages !== false
    );

    // Calculate token count (estimated)
    const tokenCount = this.estimateTokenCount(selectedMessages, systemPrompt);

    return {
      messages: selectedMessages,
      systemPrompt,
      metadata: {
        sessionId,
        branchId,
        tokenCount,
        messageCount: selectedMessages.length
      }
    };
  }

  /**
   * Apply context window constraints to select the most relevant messages
   * Prioritizes recent messages and important interactions
   */
  private applyContextConstraints(
    messages: Message[],
    maxMessages: number,
    maxTokens?: number,
    preferRecent: boolean = true
  ): Message[] {
    // Sort by timestamp (newest first if preferRecent)
    const sortedMessages = [...messages].sort((a, b) => 
      preferRecent 
        ? b.timestamp - a.timestamp 
        : a.timestamp - b.timestamp
    );

    // If we're under the message limit, return all messages
    if (sortedMessages.length <= maxMessages && !maxTokens) {
      return preferRecent ? sortedMessages.reverse() : sortedMessages;
    }

    // Apply message count limit
    let selectedMessages = sortedMessages.slice(0, maxMessages);
    
    // Apply token count limit if specified
    if (maxTokens) {
      selectedMessages = this.limitByTokenCount(selectedMessages, maxTokens);
    }

    // Return in chronological order
    return preferRecent ? selectedMessages.reverse() : selectedMessages;
  }

  /**
   * Limits messages to fit within a token budget
   */
  private limitByTokenCount(messages: Message[], maxTokens: number): Message[] {
    let totalTokens = 0;
    const result: Message[] = [];

    for (const message of messages) {
      const estimatedTokens = this.estimateMessageTokens(message);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }
      
      result.push(message);
      totalTokens += estimatedTokens;
    }

    return result;
  }

  /**
   * Estimates the token count for a message
   * Simple heuristic: ~4 characters per token for English text
   */
  private estimateMessageTokens(message: Message): number {
    if (message.metadata?.tokens) {
      return message.metadata.tokens;
    }
    
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(message.content.length / 4);
  }

  /**
   * Estimates total token count for a context
   */
  private estimateTokenCount(messages: Message[], systemPrompt?: string): number {
    let count = messages.reduce(
      (sum, message) => sum + this.estimateMessageTokens(message), 
      0
    );
    
    if (systemPrompt) {
      count += Math.ceil(systemPrompt.length / 4);
    }
    
    return count;
  }

  /**
   * Find messages that are semantically similar to a query
   * (Placeholder for future vector store integration)
   */
  async findRelevantMessages(
    sessionId: string,
    query: string,
    limit: number = 5
  ): Promise<Message[]> {
    // This would connect to the vector store in the future
    // For now, return recent messages as a fallback
    return this.redis.getMessages(
      sessionId,
      undefined,
      { limit }
    );
  }
} 