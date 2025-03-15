import { Tokenizer } from 'tokenizers';
import { LLMServiceError } from '../errors';
import axios from 'axios';
import logger from '../../../utils/logger';

export class TokenCounterError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'TOKEN_COUNTER_ERROR', 500, context);
  }
}

export interface TokenCountOptions {
  model?: string;
  addSpecialTokens?: boolean;
}

/**
 * Fallback map of Ollama model names to their HuggingFace tokenizer counterparts
 * Only used when dynamic information retrieval fails
 */
const FALLBACK_TOKENIZER_MAP: Record<string, string> = {
  // Llama models
  'llama': 'meta-llama/Llama-2-7b',
  'llama2': 'meta-llama/Llama-2-7b',
  'llama3': 'meta-llama/Llama-3-8b',
  'codellama': 'codellama/CodeLlama-7b-hf',
  
  // Mistral models
  'mistral': 'mistralai/Mistral-7B-v0.1',
  'mixtral': 'mistralai/Mixtral-8x7B-v0.1',
  
  // Other models
  'qwen': 'Qwen/Qwen-7B',
  'deepseek-coder': 'deepseek-ai/deepseek-coder-1.3b-base',
  'deepseek': 'deepseek-ai/deepseek-llm-7b-base',
  'phi': 'microsoft/phi-2',
};

/**
 * Fallback context window sizes when not available from model info
 */
const FALLBACK_CONTEXT_SIZES: Record<string, number> = {
  // Llama models
  'llama': 4096,
  'llama2': 4096,
  'llama3': 8192,
  'codellama': 16384,
  
  // Mistral models
  'mistral': 8192,
  'mixtral': 32768,
  
  // Other models
  'qwen': 8192,
  'deepseek-coder': 16384,
  'deepseek': 8192,
  'phi': 2048,
  
  // OpenAI models for reference
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-3.5-turbo': 16384,
};

interface ModelInfo {
  tokenizer?: string;
  contextLength?: number;
  family?: string;
  timestamp?: number;
}

/**
 * Token counter service using HuggingFace tokenizers
 * Provides accurate token counting for various open source LLM models
 */
export class TokenCounter {
  private tokenizers: Map<string, Tokenizer> = new Map();
  private modelInfoCache: Map<string, ModelInfo> = new Map();
  private ollamaBaseUrl: string;
  private cacheTTL: number = 30 * 60 * 1000; // 30 minutes
  
  constructor(ollamaBaseUrl: string = 'http://localhost:11434') {
    this.ollamaBaseUrl = ollamaBaseUrl;
  }
  
  /**
   * Get model information from Ollama API
   */
  private async getModelInfoFromAPI(modelName: string): Promise<ModelInfo | null> {
    try {
      // Check cache first
      if (this.modelInfoCache.has(modelName)) {
        const cachedInfo = this.modelInfoCache.get(modelName)!;
        // Check if cache is still valid
        if (Date.now() - (cachedInfo.timestamp || 0) < this.cacheTTL) {
          return cachedInfo;
        }
      }
      
      // Make API request to Ollama
      const response = await axios.get(`${this.ollamaBaseUrl}/api/show`, {
        params: { name: modelName },
        timeout: 3000 // 3 second timeout
      });
      
      if (response.status !== 200) {
        return null;
      }
      
      const modelData = response.data;
      
      // Extract useful information
      const modelInfo: ModelInfo = {
        family: modelData.family || modelData.modelFamily,
        contextLength: modelData.parameters?.['context_length'] || 
                     modelData.context_length || 
                     modelData.contextLength,
        timestamp: Date.now()
      };
      
      // Infer tokenizer from model family
      if (modelInfo.family) {
        const family = modelInfo.family.toLowerCase();
        if (family.includes('llama')) {
          modelInfo.tokenizer = 'meta-llama/Llama-2-7b';
        } else if (family.includes('mistral')) {
          modelInfo.tokenizer = 'mistralai/Mistral-7B-v0.1';
        } else if (family.includes('falcon')) {
          modelInfo.tokenizer = 'tiiuae/falcon-7b';
        } else if (family.includes('gpt-neox')) {
          modelInfo.tokenizer = 'EleutherAI/gpt-neox-20b';
        } else if (family.includes('qwen')) {
          modelInfo.tokenizer = 'Qwen/Qwen-7B';
        } else if (family.includes('phi')) {
          modelInfo.tokenizer = 'microsoft/phi-2';
        }
      }
      
      // Cache the model info
      this.modelInfoCache.set(modelName, modelInfo);
      return modelInfo;
      
    } catch (error) {
      logger.warn(`Failed to fetch model info for ${modelName}:`, error);
      return null;
    }
  }
  
  /**
   * Get a tokenizer for the specified model with multi-tiered fallback
   */
  private async getTokenizer(model?: string): Promise<Tokenizer> {
    // Default to Llama2 if no model specified
    const modelName = model || 'llama2';
    
    // If we already loaded this tokenizer, return it
    if (this.tokenizers.has(modelName)) {
      return this.tokenizers.get(modelName)!;
    }
    
    try {
      let hfModelName: string | undefined;
      
      // Tier 1: Try to get from API/dynamic source
      const modelInfo = await this.getModelInfoFromAPI(modelName);
      if (modelInfo?.tokenizer) {
        hfModelName = modelInfo.tokenizer;
      }
      
      // Tier 2: Fall back to our mapping
      if (!hfModelName) {
        hfModelName = FALLBACK_TOKENIZER_MAP[modelName];
      }
      
      // Tier 3: Default to Llama2 if all else fails
      if (!hfModelName) {
        hfModelName = 'meta-llama/Llama-2-7b';
        logger.warn(`No tokenizer mapping found for ${modelName}, using default Llama-2 tokenizer`);
      }
      
      // Create tokenizer from the identified source
      const tokenizer = await Tokenizer.fromPretrained(hfModelName);
      this.tokenizers.set(modelName, tokenizer);
      
      return tokenizer;
    } catch (error) {
      throw new TokenCounterError(`Failed to load tokenizer for model ${modelName}`, { error });
    }
  }

  /**
   * Count tokens in text using the specified model's tokenizer
   * @param text Text to tokenize
   * @param options Tokenization options
   * @returns Number of tokens
   */
  async countTokens(text: string, options: TokenCountOptions = {}): Promise<number> {
    try {
      const tokenizer = await this.getTokenizer(options.model);
      const encoded = await tokenizer.encode(text);
      return encoded.getIds().length;
    } catch (error) {
      logger.warn('Tokenization failed, using fallback:', error);
      // Fallback to rough character estimate if tokenization fails
      return this.estimateTokensByChars(text);
    }
  }

  /**
   * Count tokens in a conversation with multiple messages
   * Includes overhead for message formatting
   */
  async countConversationTokens(
    messages: Array<{ role: string; content: string }>,
    model?: string
  ): Promise<number> {
    // Get base token count for all message content
    let totalTokens = 0;
    for (const message of messages) {
      totalTokens += await this.countTokens(message.content, { model });
      // Add overhead for message role
      totalTokens += 4; // Approximate overhead per message
    }
    
    // Add overhead for conversation formatting
    totalTokens += 2; // Approximate overhead for conversation
    
    return totalTokens;
  }

  /**
   * Estimate tokens by character count (fallback method)
   * Different ratios for different languages, defaulting to English
   */
  private estimateTokensByChars(text: string): number {
    // Check if text is primarily ASCII/Latin
    const nonLatinRatio = [...text].filter(char => char.charCodeAt(0) > 127).length / text.length;
    
    if (nonLatinRatio > 0.5) {
      // For languages with non-Latin scripts (Chinese, Japanese, etc.)
      // These languages are more dense in information per character
      return Math.ceil(text.length / 1.5);
    } else {
      // For Latin-based languages (English, Spanish, etc.)
      // Roughly 4 characters per token for English
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Get the maximum context window size for a model
   * Uses dynamic model info with fallback to predefined values
   */
  async getContextWindowSize(model: string): Promise<number> {
    try {
      // Try to get from model info cache/API first
      const modelInfo = await this.getModelInfoFromAPI(model);
      if (modelInfo?.contextLength) {
        return modelInfo.contextLength;
      }
      
      // Fall back to hardcoded values
      return FALLBACK_CONTEXT_SIZES[model] || 4096;
    } catch (error) {
      logger.warn(`Error getting context window size for model ${model}:`, error);
      // Default fallback
      return 4096;
    }
  }
} 