import { RedisOptions } from 'ioredis';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface MemoryConfig {
  redis: RedisConfig;
  database?: DatabaseConfig;
  vectorStore?: VectorStoreConfig;
  persistence?: PersistenceConfig;
  defaults: {
    sessionTTL: number;      // Time-to-live for session data in seconds
    maxContextSize: number;  // Maximum number of messages to keep in context
    maxMessageSize: number;  // Maximum size of a single message in bytes
    contextWindowPercentage: number; // Percentage of model's context length to use for memory
  };
  langchain?: {
    enabled: boolean;
    model?: BaseChatModel;
    memory?: {
      useLangChainMemory: boolean;
      maxMessages?: number;
      summarizeAfter?: number;
    };
  };
}

/**
 * Redis memory configuration
 */
export interface RedisConfig {
  enabled: boolean;
  url: string;
  prefix?: string;
  sessionTTL: number;
}

export interface DatabaseConfig {
  enabled: boolean;
  type: 'supabase' | 'postgres';
  url: string;               // Database connection URL or Supabase URL
  key?: string;              // API key for Supabase
  messagesTable?: string;    // Table name for messages
  sessionsTable?: string;    // Table name for chat sessions
}

export interface VectorStoreConfig {
  enabled: boolean;
  type: 'pgvector' | 'supabase';
  url: string;               // Database URL
  key?: string;              // API key for Supabase
  tableName?: string;        // Table name for embeddings
  dimensions?: number;       // Embedding dimensions
}

export interface PersistenceConfig {
  enabled: boolean;
  persistImmediately: boolean; // Store in DB immediately or in batches
  maxRedisAge: number;         // Max age of messages in Redis in seconds
  batchSize: number;           // Size of batches for bulk persistence
  cleanupInterval: number;     // Interval for Redis cleanup job in seconds
}

export interface EmbeddingServiceConfig {
  model: BaseChatModel;
  config?: {
    dimensions?: number;
    modelConfig?: Record<string, any>;
  };
}

/**
 * Default memory configuration
 */
export const DEFAULT_MEMORY_CONFIG = {
  redis: {
    enabled: true,
    url: 'redis://localhost:6379',
    prefix: 'fast-chat:memory:',
    sessionTTL: 24 * 60 * 60 // 24 hours
  },
  database: {
    type: 'supabase' as const,
    url: '',
    key: '',
    enabled: false
  },
  defaults: {
    maxContextSize: 4000,
    sessionTTL: 24 * 60 * 60, // 24 hours
    maxMessageSize: 32000
  }
}; 