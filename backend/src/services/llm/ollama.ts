// @ts-nocheck
/**
 * ollama service
 * 
 * implements the LLMProvider interface for Ollama.
 * handles streaming responses, model listing, and configuration.
 */

import { EventEmitter } from 'events';
import { config } from '../../config/index';
import logger from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';

// interfaces for the ollama service
export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
    format: string;
  };
}

export interface OllamaCompletionRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    stop?: string[];
  };
  system?: string;
  context?: number[];
}

export interface OllamaCompletionResponse {
  model: string;
  created_at: string;
  response: string;
  context: number[];
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// type for stream controller
export interface StreamController extends EventEmitter {
  abort: () => void;
}

// Hardcoded models we know exist in our Ollama service
const AVAILABLE_MODELS: OllamaModel[] = [
  {
    name: 'llama3.2:latest',
    modified_at: new Date().toISOString(),
    size: 2.0 * 1024 * 1024 * 1024, // 2.0 GB
    digest: 'a80c4f17acd5',
    details: {
      family: 'llama',
      parameter_size: '3.2B',
      quantization_level: 'Q4_K_M',
      format: 'gguf',
      families: ['llama']
    }
  },
  {
    name: 'deepseek-r1:latest',
    modified_at: new Date().toISOString(),
    size: 4.7 * 1024 * 1024 * 1024, // 4.7 GB
    digest: '0a8c26691023',
    details: {
      family: 'deepseek',
      parameter_size: '7.6B',
      quantization_level: 'Q4_K_M',
      format: 'gguf',
      families: ['deepseek']
    }
  }
];

// ollama service implementation
export const ollamaService = {
  /**
   * base url for ollama api
   */
  baseUrl: config.llm.ollamaBaseUrl,

  /**
   * fetches a list of available models from ollama
   */
  async listModels(): Promise<OllamaModel[]> {
    logger.debug('=== [OLLAMA SERVICE] Listing models ===', {
      baseUrl: this.baseUrl,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('=== [OLLAMA SERVICE] Error listing models ===', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          baseUrl: this.baseUrl
        });
        throw new ApiError('Failed to list Ollama models', response.status);
      }

      const data = await response.json();
      logger.debug('=== [OLLAMA SERVICE] Models listed successfully ===', {
        modelCount: data.models?.length || 0,
        models: data.models?.map((m: any) => m.name)
      });
      return data.models || [];
    } catch (error) {
      logger.error('=== [OLLAMA SERVICE] Exception listing models ===', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : error,
        baseUrl: this.baseUrl
      });
      throw error;
    }
  },
  
  /**
   * validates and returns the exact model name from available models
   */
  async validateModel(model: string): Promise<string> {
    logger.debug('=== [OLLAMA SERVICE] Validating model ===', {
      model,
      timestamp: new Date().toISOString()
    });

    try {
      const models = await this.listModels();
      const modelExists = models.some(m => m.name === model);
      
      logger.debug('=== [OLLAMA SERVICE] Model validation result ===', {
        model,
        exists: modelExists,
        availableModels: models.map(m => m.name)
      });

      if (!modelExists) {
        throw new ApiError(`Model ${model} not found`, 404);
      }
      return model;
    } catch (error) {
      logger.error('=== [OLLAMA SERVICE] Model validation failed ===', {
        model,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : error
      });
      throw error;
    }
  },
  
  /**
   * generates a completion using ollama's api with streaming
   * returns an event emitter that emits 'data', 'end', and 'error' events
   */
  async generateCompletion(request: OllamaCompletionRequest): Promise<OllamaCompletionResponse> {
    logger.debug('=== [OLLAMA SERVICE] Generating completion ===', {
      model: request.model,
      promptLength: request.prompt.length,
      stream: request.stream,
      options: request.options,
      timestamp: new Date().toISOString()
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('=== [OLLAMA SERVICE] Completion generation failed ===', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          request: {
            model: request.model,
            promptLength: request.prompt.length,
            stream: request.stream,
            options: request.options
          }
        });
        throw new ApiError('Failed to generate completion', response.status);
      }

      const data = await response.json();
      logger.debug('=== [OLLAMA SERVICE] Completion generated successfully ===', {
        model: data.model,
        responseLength: data.response?.length,
        done: data.done,
        totalDuration: data.total_duration
      });
      return data;
    } catch (error) {
      logger.error('=== [OLLAMA SERVICE] Exception generating completion ===', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack
        } : error,
        request: {
          model: request.model,
          promptLength: request.prompt.length,
          stream: request.stream,
          options: request.options
        }
      });
      throw error;
    }
  }
}; 

// Test function to directly test listModels
export async function testListModels() {
  try {
    logger.info('Testing hardcoded models list');
    const models = await ollamaService.listModels();
    logger.info('Successfully retrieved models:', { models });
    return models;
  } catch (error) {
    logger.error('Error in testListModels:', error);
    throw error;
  }
} 