import axios from 'axios';
import { LLMServiceError } from '../errors';
import logger from '../../../utils/logger';

/**
 * Error specific to embedding operations
 */
export class EmbeddingError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'EMBEDDING_ERROR', 500, context);
  }
}

export interface EmbeddingServiceConfig {
  apiUrl: string;
  model: string;
  dimensions?: number;
  batchSize?: number;
}

/**
 * Service for generating text embeddings using Ollama API
 */
export class EmbeddingService {
  private apiUrl: string;
  private model: string;
  private dimensions: number;
  private batchSize: number;
  
  constructor(config: EmbeddingServiceConfig) {
    this.apiUrl = config.apiUrl;
    this.model = config.model;
    this.dimensions = config.dimensions || 1536; // Default dimension for compatibility
    this.batchSize = config.batchSize || 10;
  }
  
  /**
   * Generate an embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.apiUrl}/api/embeddings`, {
        model: this.model,
        prompt: text,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      });
      
      const { embedding } = response.data;
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new EmbeddingError('Invalid embedding response format', { response: response.data });
      }
      
      // Verify embedding dimensions
      if (embedding.length !== this.dimensions) {
        logger.warn(`Expected embedding dimension ${this.dimensions}, got ${embedding.length}`);
      }
      
      return embedding;
    } catch (error: any) {
      logger.error('Error generating embedding:', error);
      if (error instanceof EmbeddingError) {
        throw error;
      }
      
      if (axios.isAxiosError(error)) {
        throw new EmbeddingError(
          `Embedding generation failed: ${error.message}`,
          { 
            status: error.response?.status,
            data: error.response?.data
          }
        );
      }
      
      throw new EmbeddingError('Embedding generation failed', { error });
    }
  }
  
  /**
   * Generate embeddings for multiple texts
   * Processes texts in batches to avoid overloading the API
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        embeddings.push(...batchResults);
      } catch (error) {
        logger.error(`Error processing embedding batch ${i}-${i + batch.length}:`, error);
        throw new EmbeddingError('Failed to process embedding batch', { 
          batchIndex: i, 
          error 
        });
      }
    }
    
    return embeddings;
  }
  
  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new EmbeddingError(
        'Cannot calculate similarity between embeddings of different dimensions',
        { dimensions1: embedding1.length, dimensions2: embedding2.length }
      );
    }
    
    // Cosine similarity calculation
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      magnitude1 += embedding1[i] * embedding1[i];
      magnitude2 += embedding2[i] * embedding2[i];
    }
    
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    return dotProduct / (magnitude1 * magnitude2);
  }
}

/**
 * Factory function to create an embedding service with default configuration
 */
export function createEmbeddingService(
  apiUrl: string,
  model: string = 'llama3',
  dimensions: number = 1536
): EmbeddingService {
  return new EmbeddingService({
    apiUrl,
    model,
    dimensions,
  });
} 