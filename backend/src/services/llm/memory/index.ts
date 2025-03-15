import { Message } from '../types';
import { RedisManager } from './redis';
import { ContextManager } from './context';
import { BranchManager } from './branch';
import { VectorStore } from './vector';
import { EmbeddingService } from './embedding';
import { MemoryConfig, DEFAULT_MEMORY_CONFIG } from './config';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Error specific to memory operations
 */
export class MemoryError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'MEMORY_ERROR', 500, context);
  }
}

/**
 * Configuration for memory manager
 */
export interface MemoryManagerConfig {
  redisUrl?: string;
  sessionTTL?: number;
  vectorStore?: {
    type: 'supabase';
    supabaseUrl: string;
    supabaseKey: string;
    tableName?: string;
  };
  embeddingService?: {
    apiUrl: string;
    model: string;
    dimensions?: number;
  };
  database?: {
    supabaseUrl: string;
    supabaseKey: string;
    messagesTable?: string;
    sessionsTable?: string;
  };
  persistenceOptions?: {
    persistImmediately?: boolean; // Store in DB immediately or in batches
    maxRedisAge?: number; // Max age of messages in Redis in seconds
    batchSize?: number;   // Size of batches for bulk persistence
  };
}

/**
 * Extended message metadata including similarity score and persistence information
 */
interface ExtendedMessageMetadata {
  tokens?: number;
  embedding?: number[];
  edited?: boolean;
  originalContent?: string;
  originalMessageId?: string;
  similarity?: number;
  persistedAt?: number; // When message was persisted to structured DB
  model?: string;
  [key: string]: any; // Allow other properties
}

// Update the Message type to use our extended metadata
interface StoredMessage extends Omit<Message, 'metadata'> {
  metadata?: ExtendedMessageMetadata;
}

/**
 * Memory Manager integrates multiple storage components:
 * - Redis for immediate message storage (short-term/working memory)
 * - Supabase for structured data persistence (long-term memory)
 * - Vector Store for semantic search
 * - Embedding Service for generating embeddings
 */
export class MemoryManager {
  private redis: RedisManager;
  private contextManager: ContextManager;
  private branchManager: BranchManager;
  private vectorStore: VectorStore | null = null;
  private embeddingService: EmbeddingService | null = null;
  private supabase: SupabaseClient | null = null;
  private config: MemoryConfig;
  private messagesTable: string;
  private sessionsTable: string;
  private persistImmediately: boolean;
  private maxRedisAge: number;
  private batchSize: number;
  private initialized: boolean = false;
  private persistenceInterval: NodeJS.Timeout | null = null;
  
  constructor(config: MemoryManagerConfig) {
    // Merge with default config
    this.config = {
      ...DEFAULT_MEMORY_CONFIG,
      redis: {
        ...DEFAULT_MEMORY_CONFIG.redis,
        url: config.redisUrl || DEFAULT_MEMORY_CONFIG.redis.url,
        sessionTTL: config.sessionTTL || DEFAULT_MEMORY_CONFIG.redis.sessionTTL
      }
    };
    
    // Set persistence options
    this.persistImmediately = config.persistenceOptions?.persistImmediately ?? true;
    this.maxRedisAge = config.persistenceOptions?.maxRedisAge ?? 7 * 24 * 60 * 60; // 7 days default
    this.batchSize = config.persistenceOptions?.batchSize ?? 50;
    
    // Table names
    this.messagesTable = config.database?.messagesTable || 'messages';
    this.sessionsTable = config.database?.sessionsTable || 'sessions';
    
    // Initialize Redis manager
    this.redis = new RedisManager(this.config.redis);
    
    // Initialize context and branch managers
    this.contextManager = new ContextManager(this.redis, this.config);
    this.branchManager = new BranchManager(this.redis);
    
    // Initialize vector store if configured
    if (config.vectorStore) {
      this.vectorStore = new VectorStore({
        supabaseUrl: config.vectorStore.supabaseUrl,
        supabaseKey: config.vectorStore.supabaseKey,
        tableName: config.vectorStore.tableName
      });
    }
    
    // Initialize embedding service if configured
    if (config.embeddingService) {
      this.embeddingService = new EmbeddingService({
        apiUrl: config.embeddingService.apiUrl,
        model: config.embeddingService.model,
        dimensions: config.embeddingService.dimensions
      });
    }
    
    // Initialize Supabase client if database is configured
    if (config.database) {
      this.supabase = createClient(
        config.database.supabaseUrl,
        config.database.supabaseKey
      );
    }
  }
  
  /**
   * Initialize all memory components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing memory manager components...');
      
      // Initialize Redis connection
      await this.redis.initialize();
      
      // Initialize vector store if available
      if (this.vectorStore) {
        await this.vectorStore.initialize();
      }
      
      // Check database connection if available
      if (this.supabase) {
        const { error } = await this.supabase
          .from(this.messagesTable)
          .select('count', { count: 'exact', head: true });
          
        if (error) {
          logger.warn(`Database connection issue: ${error.message}. Some persistence features may not work.`);
        } else {
          logger.info(`Successfully connected to database, messages table: ${this.messagesTable}`);
          
          // Start background persistence job
          if (!this.persistImmediately) {
            this.startPersistenceJob();
          }
        }
      }
      
      this.initialized = true;
      logger.info('Memory manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize memory manager:', error);
      throw new MemoryError('Memory manager initialization failed', { error });
    }
  }
  
  /**
   * Start a background job to periodically persist messages from Redis to the database
   */
  private startPersistenceJob(): void {
    // Clear any existing interval
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    
    // Run every 5 minutes (adjust as needed)
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.persistBatchFromRedis();
      } catch (error) {
        logger.error('Error in persistence job:', error);
      }
    }, 5 * 60 * 1000);
  }
  
  /**
   * Store a message in memory system following the workflow:
   * 1. Store in Redis (short-term memory)
   * 2. Optionally generate embedding for vector store
   * 3. Optionally persist to database
   */
  async storeMessage(
    message: Message, 
    generateEmbedding: boolean = false,
    persistToDB: boolean = true
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Store in Redis first (short-term memory)
      await this.redis.addMessage(message);
      
      // Generate and store embedding if requested and available
      if (generateEmbedding && this.vectorStore && this.embeddingService) {
        const embedding = await this.embeddingService.generateEmbedding(message.content);
        
        await this.vectorStore.storeEmbedding(
          message.id,
          message.content,
          embedding,
          {
            role: message.role,
            session_id: message.sessionId,
            branch_id: message.branchId || 'main',
            timestamp: message.timestamp
          }
        );
      }
      
      // Persist to database if requested and immediate persistence is enabled
      if (persistToDB && this.persistImmediately && this.supabase) {
        await this.persistMessageToDB(message);
      }
    } catch (error) {
      logger.error('Error storing message:', error);
      throw new MemoryError('Failed to store message', { 
        messageId: message.id, 
        error 
      });
    }
  }
  
  /**
   * Persist a message from Redis to the database
   */
  private async persistMessageToDB(message: Message): Promise<void> {
    if (!this.supabase) {
      logger.warn('Attempted to persist message but database is not configured');
      return;
    }
    
    try {
      // Prepare message for database (format fields as needed)
      const dbMessage = {
        id: message.id,
        session_id: message.sessionId,
        content: message.content,
        role: message.role,
        created_at: new Date(message.timestamp).toISOString(),
        branch_id: message.branchId,
        parent_id: message.parentMessageId, // Use parent_id to match existing schema
        version: message.version,
        model: (message.metadata as ExtendedMessageMetadata)?.model || null, // Include model field
        metadata: message.metadata
      };
      
      // Insert into database
      const { error } = await this.supabase
        .from(this.messagesTable)
        .upsert(dbMessage, { onConflict: 'id' });
        
      if (error) {
        throw new MemoryError('Failed to persist message to database', { 
          messageId: message.id, 
          error 
        });
      }
      
      // Update message metadata to mark as persisted
      const extendedMetadata: ExtendedMessageMetadata = {
        ...(message.metadata || {}),
        persistedAt: Date.now()
      };
      
      const updatedMessage: StoredMessage = {
        ...message,
        metadata: extendedMetadata
      };
      
      // Update metadata in Redis
      const messageKey = this.redis.buildKey('messageData', message.id);
      await this.redis.getClient().set(messageKey, JSON.stringify(updatedMessage));
      
      logger.debug(`Persisted message ${message.id} to database`);
    } catch (error) {
      logger.error('Error persisting message to database:', error);
      throw new MemoryError('Failed to persist message to database', { 
        messageId: message.id, 
        error 
      });
    }
  }
  
  /**
   * Persist a batch of messages from Redis to the database
   */
  async persistBatchFromRedis(sessionId?: string): Promise<number> {
    if (!this.supabase) {
      logger.warn('Attempted to persist batch but database is not configured');
      return 0;
    }
    
    try {
      // Get all session IDs if not specified
      const sessionIds = sessionId 
        ? [sessionId] 
        : await this.getActiveSessions();
      
      let totalPersisted = 0;
      
      // Process each session
      for (const sid of sessionIds) {
        // Get messages for this session that haven't been persisted
        const messages = await this.getUnpersistedMessages(sid);
        
        if (messages.length === 0) {
          continue;
        }
        
        // Process in batches
        for (let i = 0; i < messages.length; i += this.batchSize) {
          const batch = messages.slice(i, i + this.batchSize);
          
          // Format messages for database
          const dbMessages = batch.map(msg => ({
            id: msg.id,
            session_id: msg.sessionId,
            content: msg.content,
            role: msg.role,
            created_at: new Date(msg.timestamp).toISOString(),
            branch_id: msg.branchId,
            parent_id: msg.parentMessageId, // Use parent_id to match existing schema
            model: (msg.metadata as ExtendedMessageMetadata)?.model || null, // Include model field
            version: msg.version,
            metadata: msg.metadata
          }));
          
          // Insert batch into database
          const { error } = await this.supabase
            .from(this.messagesTable)
            .upsert(dbMessages, { onConflict: 'id' });
            
          if (error) {
            throw new MemoryError('Failed to persist batch to database', { error });
          }
          
          // Update metadata in Redis to mark as persisted
          for (const message of batch) {
            const extendedMetadata: ExtendedMessageMetadata = {
              ...(message.metadata || {}),
              persistedAt: Date.now()
            };
            
            const updatedMessage: StoredMessage = {
              ...message,
              metadata: extendedMetadata
            };
            
            const messageKey = this.redis.buildKey('messageData', message.id);
            await this.redis.getClient().set(messageKey, JSON.stringify(updatedMessage));
          }
          
          totalPersisted += batch.length;
        }
      }
      
      logger.info(`Persisted ${totalPersisted} messages to database`);
      return totalPersisted;
    } catch (error) {
      logger.error('Error persisting batch to database:', error);
      throw new MemoryError('Failed to persist batch to database', { error });
    }
  }
  
  /**
   * Retrieve messages from the database
   */
  async getMessagesFromDB(
    sessionId: string,
    options: {
      limit?: number;
      offset?: number;
      startTime?: number;
      endTime?: number;
      branchId?: string;
    } = {}
  ): Promise<Message[]> {
    if (!this.supabase) {
      logger.warn('Attempted to get messages from database but database is not configured');
      return [];
    }
    
    try {
      // Start query
      let query = this.supabase
        .from(this.messagesTable)
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      
      // Apply filters
      if (options.branchId) {
        query = query.eq('branch_id', options.branchId);
      }
      
      if (options.startTime) {
        query = query.gte('created_at', new Date(options.startTime).toISOString());
      }
      
      if (options.endTime) {
        query = query.lte('created_at', new Date(options.endTime).toISOString());
      }
      
      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }
      
      // Execute query
      const { data, error } = await query;
      
      if (error) {
        throw new MemoryError('Failed to retrieve messages from database', { error });
      }
      
      // Convert to Message objects
      const messages: Message[] = data.map(item => ({
        id: item.id,
        sessionId: item.session_id,
        content: item.content,
        role: item.role,
        timestamp: new Date(item.created_at).getTime(),
        branchId: item.branch_id,
        parentMessageId: item.parent_id,
        version: item.version,
        metadata: item.metadata
      }));
      
      return messages;
    } catch (error) {
      logger.error('Error retrieving messages from database:', error);
      throw new MemoryError('Failed to retrieve messages from database', { error });
    }
  }
  
  /**
   * Get active session IDs from Redis
   */
  private async getActiveSessions(): Promise<string[]> {
    // Use a direct Redis search pattern instead of buildKey since 'sessions' 
    // might not be defined in the redis manager keys
    const sessionPattern = `${this.redis['keyPrefix']}session:*`;
    const keys = await this.redis.getClient().keys(sessionPattern);
    
    // Extract session IDs from keys
    return keys.map(key => {
      const parts = key.split(':');
      return parts[parts.length - 1];
    });
  }
  
  /**
   * Get messages that haven't been persisted to the database
   */
  private async getUnpersistedMessages(sessionId: string): Promise<Message[]> {
    // Get all messages for this session
    const messages = await this.redis.getMessages(sessionId);
    
    // Filter out messages that have already been persisted
    return messages.filter(msg => 
      !(msg.metadata as ExtendedMessageMetadata)?.persistedAt
    );
  }
  
  /**
   * Clean up old messages from Redis that have been persisted to the database
   */
  async cleanupRedis(maxAgeSeconds: number = this.maxRedisAge): Promise<number> {
    try {
      const now = Date.now();
      const cutoff = now - (maxAgeSeconds * 1000);
      
      // Get all session IDs
      const sessionIds = await this.getActiveSessions();
      
      let totalCleaned = 0;
      
      // Process each session
      for (const sessionId of sessionIds) {
        // Get all messages for this session
        const messages = await this.redis.getMessages(sessionId);
        
        // Find messages that are old and have been persisted
        const toClean = messages.filter(msg => 
          msg.timestamp < cutoff && 
          (msg.metadata as ExtendedMessageMetadata)?.persistedAt
        );
        
        // Remove from Redis
        for (const message of toClean) {
          const messageKey = this.redis.buildKey('messageData', message.id);
          await this.redis.getClient().del(messageKey);
          totalCleaned++;
        }
        
        // Also remove from session messages list
        if (toClean.length > 0) {
          const messagesKey = this.redis.buildKey('messages', sessionId);
          for (const message of toClean) {
            await this.redis.getClient().lrem(messagesKey, 0, message.id);
          }
        }
      }
      
      logger.info(`Cleaned up ${totalCleaned} old messages from Redis`);
      return totalCleaned;
    } catch (error) {
      logger.error('Error cleaning up Redis:', error);
      throw new MemoryError('Failed to clean up Redis', { error });
    }
  }
  
  /**
   * Find semantically similar messages in the vector store
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
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.vectorStore || !this.embeddingService) {
      logger.warn('Vector search requested but vector store or embedding service is not configured');
      
      // Fall back to recent messages from Redis
      return this.redis.getMessages(
        sessionId,
        undefined,
        { limit: options.limit || 5 }
      );
    }
    
    try {
      // Generate embedding for query
      const embedding = await this.embeddingService.generateEmbedding(query);
      
      // Prepare filter for current session
      let filter: Record<string, any> = {};
      if (!options.includeBranches) {
        filter = { session_id: sessionId };
      }
      
      // Search for similar messages
      const similar = await this.vectorStore.searchSimilar(
        embedding,
        {
          limit: options.limit || 5,
          threshold: options.threshold || 0.7,
          filter
        }
      );
      
      // Convert to Message objects by first checking Redis, then falling back to DB
      const messages: Message[] = [];
      
      for (const result of similar) {
        // First try to get from Redis
        let message = await this.getMessage(result.id);
        
        // If not in Redis, try to get from DB
        if (!message && this.supabase) {
          const { data, error } = await this.supabase
            .from(this.messagesTable)
            .select('*')
            .eq('id', result.id)
            .single();
            
          if (!error && data) {
            message = {
              id: data.id,
              sessionId: data.session_id,
              content: data.content,
              role: data.role,
              timestamp: new Date(data.created_at).getTime(),
              branchId: data.branch_id,
              parentMessageId: data.parent_id,
              version: data.version,
              metadata: data.metadata
            };
          }
        }
        
        if (message) {
          // Add similarity score to metadata
          message.metadata = {
            ...(message.metadata || {}),
            similarity: result.similarity
          } as ExtendedMessageMetadata;
          
          messages.push(message);
        }
      }
      
      return messages;
    } catch (error) {
      logger.error('Error finding similar messages:', error);
      throw new MemoryError('Failed to find similar messages', { 
        sessionId,
        query,
        error
      });
    }
  }
  
  /**
   * Get a message by ID from Redis or DB
   */
  async getMessage(messageId: string): Promise<Message | null> {
    try {
      // First try Redis
      const messageKey = this.redis.buildKey('messageData', messageId);
      const messageData = await this.redis.getClient().get(messageKey);
      
      if (messageData) {
        return JSON.parse(messageData) as Message;
      }
      
      // If not in Redis, try database
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from(this.messagesTable)
          .select('*')
          .eq('id', messageId)
          .single();
          
        if (error) {
          if (error.code === 'PGRST116') {
            // Not found
            return null;
          }
          throw error;
        }
        
        if (data) {
          // Convert to Message object
          const metadata = {
            ...(data.metadata || {}),
          };
          
          // Add model to metadata if exists in data
          if (data.model) {
            metadata.model = data.model;
          }
          
          return {
            id: data.id,
            sessionId: data.session_id,
            content: data.content,
            role: data.role,
            timestamp: new Date(data.created_at).getTime(),
            branchId: data.branch_id,
            parentMessageId: data.parent_id, // Use parent_id to match existing schema
            version: data.version || 1,
            metadata: metadata
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error retrieving message:', error);
      throw new MemoryError('Failed to retrieve message', { 
        messageId,
        error
      });
    }
  }
  
  /**
   * Assemble optimized context based on recency and semantic similarity
   */
  async assembleContext(
    sessionId: string,
    userMessage: string,
    options: {
      maxTokens?: number;
      maxMessages?: number;
      useSimilarity?: boolean;
      branchId?: string;
      includeBranches?: boolean;
    } = {}
  ) {
    try {
      // Use context manager to get base context
      const context = await this.contextManager.assembleContext(
        sessionId,
        {
          maxTokens: options.maxTokens,
          maxMessages: options.maxMessages,
          branchId: options.branchId,
        }
      );
      
      // If similarity-based enhancement is requested and available
      if (options.useSimilarity && this.vectorStore && this.embeddingService) {
        const similarMessages = await this.findSimilarMessages(
          sessionId,
          userMessage,
          {
            limit: 3, // Keep this small to avoid context bloat
            threshold: 0.8, // Higher threshold for better quality
            includeBranches: options.includeBranches
          }
        );
        
        // Add similar messages that aren't already in the context
        const existingIds = new Set(context.messages.map(m => m.id));
        for (const message of similarMessages) {
          if (!existingIds.has(message.id)) {
            context.messages.push(message);
            existingIds.add(message.id);
          }
        }
      }
      
      return context;
    } catch (error) {
      logger.error('Error assembling context:', error);
      throw new MemoryError('Failed to assemble context', { 
        sessionId,
        error
      });
    }
  }
  
  /**
   * Access underlying storage managers
   */
  getRedisManager(): RedisManager {
    return this.redis;
  }
  
  getContextManager(): ContextManager {
    return this.contextManager;
  }
  
  getBranchManager(): BranchManager {
    return this.branchManager;
  }
  
  getVectorStore(): VectorStore | null {
    return this.vectorStore;
  }
  
  getEmbeddingService(): EmbeddingService | null {
    return this.embeddingService;
  }
  
  getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Stop background persistence job
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = null;
    }
    
    // Persist any remaining messages
    if (this.supabase) {
      try {
        await this.persistBatchFromRedis();
      } catch (error) {
        logger.error('Error persisting messages during cleanup:', error);
      }
    }
    
    // Disconnect from Redis
    await this.redis.disconnect();
  }
} 