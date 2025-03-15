import { RedisOptions } from 'ioredis';

export interface MemoryConfig {
  redis: RedisConfig;
  database?: DatabaseConfig;
  vectorStore?: VectorStoreConfig;
  persistence?: PersistenceConfig;
  defaults: {
    sessionTTL: number;      // Time-to-live for session data in seconds
    maxContextSize: number;  // Maximum number of messages to keep in context
    maxMessageSize: number;  // Maximum size of a single message in bytes
  };
}

export interface RedisConfig extends RedisOptions {
  enabled: boolean;
  url?: string;              // Redis connection URL
  prefix?: string;           // Key prefix for Redis keys
  maxRetries?: number;       // Maximum number of connection retries
  retryTimeout?: number;     // Time between retries in ms
  sessionTTL?: number;       // Session TTL in seconds
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
  persistImmediately: boolean; // Store in DB immediately or in batches
  maxRedisAge: number;         // Max age of messages in Redis in seconds
  batchSize: number;           // Size of batches for bulk persistence
  cleanupInterval: number;     // Interval for Redis cleanup job in seconds
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  redis: {
    enabled: true,
    prefix: 'fast-chat:memory:',
    maxRetries: 3,
    retryTimeout: 1000,
    sessionTTL: 24 * 60 * 60,  // 24 hours
    // Redis client options
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    disconnectTimeout: 2000,
    commandTimeout: 5000,
    keepAlive: 30000,
    noDelay: true,
  },
  database: {
    enabled: false,
    type: 'supabase',
    url: '',
    messagesTable: 'messages',
    sessionsTable: 'chat_sessions',
  },
  vectorStore: {
    enabled: false,
    type: 'supabase',
    url: '',
    tableName: 'message_embeddings',
    dimensions: 1536
  },
  persistence: {
    persistImmediately: true,
    maxRedisAge: 7 * 24 * 60 * 60, // 7 days
    batchSize: 50,
    cleanupInterval: 12 * 60 * 60  // 12 hours
  },
  defaults: {
    sessionTTL: 24 * 60 * 60,     // 24 hours
    maxContextSize: 50,           // 50 messages
    maxMessageSize: 32 * 1024,    // 32KB
  },
}; 