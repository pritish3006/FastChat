// @ts-nocheck
import { Message, Context } from '../types';
import { RedisMemory } from './redis';
import { MemoryConfig } from './config';
import { LLMServiceError } from '../errors';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../../../utils/logger';

export class ContextWindowError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONTEXT_WINDOW_ERROR', 400, context);
  }
}

interface ContextOptions {
  maxMessages?: number;
  maxTokens?: number;
  includeSystemPrompt?: boolean;
  branchId?: string;
  preferRecentMessages?: boolean;
  summarize?: boolean;
}

/**
 * Manages the context window for LLM interactions
 * Handles selecting relevant messages, token budgeting, and context assembly
 */
export class ContextManager {
  private redis: RedisMemory;
  private config: MemoryConfig;

  constructor(redis: RedisMemory, config: MemoryConfig) {
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
    const messages = await this.redis.getMessages(sessionId, branchId);

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
    let selectedMessages = await this.applyContextConstraints(
      contextMessages, 
      maxMessages,
      options.maxTokens,
      options.preferRecentMessages !== false
    );

    // Optionally summarize context if it's still too large
    if (options.summarize && options.maxTokens) {
      selectedMessages = await this.summarizeIfNeeded(selectedMessages, options.maxTokens);
    }

    // Calculate token count
    const tokenCount = await this.countTokens(selectedMessages, systemPrompt);

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
   * Convert messages to LangChain format
   */
  toLangChainMessages(messages: Message[]): BaseMessage[] {
    return messages.map(msg => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'system':
          return new SystemMessage(msg.content);
        default:
          throw new Error(`Unknown message role: ${msg.role}`);
      }
    });
  }

  /**
   * Convert LangChain messages to our format
   */
  fromLangChainMessages(messages: BaseMessage[], sessionId: string): Message[] {
    return messages.map(msg => ({
      id: msg.id || crypto.randomUUID(),
      sessionId,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      role: msg instanceof HumanMessage ? 'user' :
            msg instanceof AIMessage ? 'assistant' :
            msg instanceof SystemMessage ? 'system' :
            'user',
      timestamp: Date.now(),
      version: 1,
      metadata: {
        tokens: this.countMessageTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
        model: msg.name || 'unknown'
      }
    }));
  }

  /**
   * Apply context window constraints to select the most relevant messages
   * Prioritizes recent messages and important interactions
   */
  private async applyContextConstraints(
    messages: Message[],
    maxMessages: number,
    maxTokens?: number,
    preferRecent: boolean = true
  ): Promise<Message[]> {
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
      selectedMessages = await this.limitByTokenCount(selectedMessages, maxTokens);
    }

    // Return in chronological order
    return preferRecent ? selectedMessages.reverse() : selectedMessages;
  }

  /**
   * Limits messages to fit within a token budget
   */
  private async limitByTokenCount(messages: Message[], maxTokens: number): Promise<Message[]> {
    let totalTokens = 0;
    const result: Message[] = [];

    for (const message of messages) {
      const tokens = this.countMessageTokens(message.content);
      
      if (totalTokens + tokens > maxTokens) {
        break;
      }
      
      result.push(message);
      totalTokens += tokens;
    }

    return result;
  }

  /**
   * Count tokens in a message using a heuristic approach
   * This is a simplified estimation based on common tokenization patterns
   */
  private countMessageTokens(text: string): number {
    // Split into words and count
    const words = text.trim().split(/\s+/);
    let tokenCount = 0;

    for (const word of words) {
      // Count subwords (common in tokenizers)
      const subwords = word.match(/.{1,4}/g) || [word];
      tokenCount += subwords.length;

      // Add extra tokens for special characters and punctuation
      if (word.match(/[.,!?;:]/)) {
        tokenCount += 1;
      }
    }

    // Add tokens for special tokens like <|endoftext|>
    if (text.includes('<|endoftext|>')) {
      tokenCount += 1;
    }

    // Add tokens for newlines
    tokenCount += (text.match(/\n/g) || []).length;

    return Math.ceil(tokenCount);
  }

  /**
   * Count total tokens in context
   */
  private async countTokens(messages: Message[], systemPrompt?: string): Promise<number> {
    let count = 0;
    
    for (const message of messages) {
      count += this.countMessageTokens(message.content);
    }
    
    if (systemPrompt) {
      count += this.countMessageTokens(systemPrompt);
    }
    
    return count;
  }

  /**
   * Summarize messages if they exceed token limit
   */
  private async summarizeIfNeeded(messages: Message[], maxTokens: number): Promise<Message[]> {
    const currentTokens = await this.countTokens(messages);
    
    if (currentTokens <= maxTokens) {
      return messages;
    }

    // For now, just truncate to fit
    // TODO: Implement actual summarization using LangChain
    return this.truncateToFit(messages, maxTokens);
  }

  /**
   * Truncate messages to fit token limit
   */
  private async truncateToFit(messages: Message[], maxTokens: number): Promise<Message[]> {
    const result: Message[] = [];
    let totalTokens = 0;

    // Always keep the system message if present
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      const systemTokens = this.countMessageTokens(systemMessage.content);
      totalTokens += systemTokens;
      result.push(systemMessage);
    }

    // Add most recent messages until we hit the limit
    const recentMessages = messages
      .filter(m => m.role !== 'system')
      .reverse();

    for (const message of recentMessages) {
      const tokens = this.countMessageTokens(message.content);
      if (totalTokens + tokens > maxTokens) {
        break;
      }
      result.push(message);
      totalTokens += tokens;
    }

    return result.reverse();
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