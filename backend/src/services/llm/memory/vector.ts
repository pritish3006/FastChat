import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';
import { Message } from '../types';

/**
 * Vector store error class for specific error handling
 */
export class VectorStoreError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VECTOR_STORE_ERROR', 500, context);
  }
}

export interface VectorStoreConfig {
  supabaseUrl: string;
  supabaseKey: string;
  tableName?: string;
  embeddingDimension?: number;
}

export interface SimilarityResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

/**
 * Vector Store implementation using Supabase and pgvector
 * Handles storage and retrieval of message embeddings for semantic search
 */
export class VectorStore {
  private supabase: SupabaseClient;
  private tableName: string;
  private dimension: number;
  private initialized: boolean = false;

  constructor(private config: VectorStoreConfig) {
    this.tableName = config.tableName || 'message_embeddings';
    this.dimension = config.embeddingDimension || 1536; // Default to OpenAI embedding dimension
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Initialize the vector store and verify pgvector extension
   */
  async initialize(): Promise<void> {
    try {
      // Check if pgvector extension is installed
      const { data: extensions, error: extensionError } = await this.supabase
        .from('pg_extension')
        .select('extname')
        .eq('extname', 'vector');

      if (extensionError) {
        throw new VectorStoreError('Failed to check pgvector extension', { error: extensionError });
      }

      if (!extensions || extensions.length === 0) {
        logger.warn('pgvector extension not found. Vector search will not work properly.');
      }

      // Check if the table exists
      const { error: tableError } = await this.supabase
        .from(this.tableName)
        .select('id')
        .limit(1);

      if (tableError && tableError.code !== 'PGRST116') {
        logger.warn(`Vector embeddings table '${this.tableName}' may not exist: ${tableError.message}`);
      }

      this.initialized = true;
      logger.info(`Vector store initialized with table: ${this.tableName}`);
    } catch (error) {
      logger.error('Failed to initialize vector store:', error);
      throw new VectorStoreError('Vector store initialization failed', { error });
    }
  }

  /**
   * Store message embedding in the vector database
   */
  async storeEmbedding(
    messageId: string,
    content: string,
    embedding: number[],
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (embedding.length !== this.dimension) {
      throw new VectorStoreError(
        `Embedding dimension mismatch. Expected ${this.dimension}, got ${embedding.length}`
      );
    }

    try {
      const { error } = await this.supabase.from(this.tableName).insert({
        id: messageId,
        content,
        embedding,
        metadata
      });

      if (error) {
        throw new VectorStoreError('Failed to store embedding', { error });
      }
    } catch (error) {
      logger.error('Error storing embedding:', error);
      throw new VectorStoreError('Failed to store embedding', { error });
    }
  }

  /**
   * Update existing embedding with new content and vector
   */
  async updateEmbedding(
    messageId: string,
    content: string,
    embedding: number[],
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .update({
          content,
          embedding,
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) {
        throw new VectorStoreError('Failed to update embedding', { error });
      }
    } catch (error) {
      logger.error('Error updating embedding:', error);
      throw new VectorStoreError('Failed to update embedding', { error });
    }
  }

  /**
   * Delete embedding by message ID
   */
  async deleteEmbedding(messageId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', messageId);

      if (error) {
        throw new VectorStoreError('Failed to delete embedding', { error });
      }
    } catch (error) {
      logger.error('Error deleting embedding:', error);
      throw new VectorStoreError('Failed to delete embedding', { error });
    }
  }

  /**
   * Search for similar messages using vector similarity
   */
  async searchSimilar(
    embedding: number[],
    options: {
      limit?: number;
      threshold?: number;
      filter?: Record<string, any>;
    } = {}
  ): Promise<SimilarityResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const limit = options.limit || 5;
    const threshold = options.threshold || 0.7;

    try {
      // Using cosine similarity with pgvector
      // We need to use raw SQL for vector operations
      const { data, error } = await this.supabase.rpc('match_messages', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit
      });

      if (error) {
        throw new VectorStoreError('Failed to perform similarity search', { error });
      }

      return data.map((result: any) => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        similarity: result.similarity
      }));
    } catch (error) {
      logger.error('Error performing similarity search:', error);
      throw new VectorStoreError('Failed to perform similarity search', { error });
    }
  }

  /**
   * Search for similar content using text input
   * This requires having an embedding function available
   */
  async searchSimilarByText(
    text: string,
    createEmbedding: (text: string) => Promise<number[]>,
    options: {
      limit?: number;
      threshold?: number;
      filter?: Record<string, any>;
    } = {}
  ): Promise<SimilarityResult[]> {
    // Generate embedding for the text
    const embedding = await createEmbedding(text);
    
    // Perform similarity search with the generated embedding
    return this.searchSimilar(embedding, options);
  }

  /**
   * Import messages with embeddings in batch
   */
  async importMessageEmbeddings(
    messages: Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Process in batches to avoid request size limitations
    const batchSize = 100;
    const batches = [];

    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    try {
      for (const batch of batches) {
        const { error } = await this.supabase.from(this.tableName).insert(
          batch.map(msg => ({
            id: msg.id,
            content: msg.content,
            embedding: msg.embedding,
            metadata: msg.metadata || {}
          }))
        );

        if (error) {
          throw new VectorStoreError('Failed to import message embeddings batch', { error });
        }
      }
    } catch (error) {
      logger.error('Error importing message embeddings:', error);
      throw new VectorStoreError('Failed to import message embeddings', { error });
    }
  }

  /**
   * Get total count of embeddings stored
   */
  async getEmbeddingCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        throw new VectorStoreError('Failed to get embedding count', { error });
      }

      return count || 0;
    } catch (error) {
      logger.error('Error getting embedding count:', error);
      throw new VectorStoreError('Failed to get embedding count', { error });
    }
  }
}

// Export a factory function for easier instantiation
export function createVectorStore(config: VectorStoreConfig): VectorStore {
  return new VectorStore(config);
} 