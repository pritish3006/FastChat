import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ModelConfig, StreamChunk, StreamOptions, StreamCallbacks, ChatCompletionParams } from '../types';
import { EventEmitter } from 'events';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Export interfaces that are only used in provider implementations
export interface ChatCompletionResponse {
  text: string;
}

export interface StreamController extends EventEmitter {
  abort: () => void;
}

// Model type used by provider implementations
export interface Model {
  id: string;
  name: string;
  contextLength: number;
}

/**
 * Base provider class that all LLM providers must implement
 */
export abstract class BaseProvider {
  protected model: BaseChatModel | null = null;
  modelId: string;
  protected config: ModelConfig;
  protected client: any;

  constructor(config: ModelConfig) {
    this.config = config;
    this.modelId = config.modelId;
  }

  /**
   * Initialize the provider with the given configuration
   */
  abstract initialize(): Promise<void>;

  /**
   * Validate the provider configuration
   */
  abstract validateConfig(): Promise<void>;

  /**
   * Stream chat completion tokens
   */
  abstract streamChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: StreamOptions,
    callbacks?: StreamCallbacks
  ): AsyncGenerator<StreamChunk>;
  
  /**
   * Generate a chat completion response
   */
  abstract generateChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse | StreamController>;
  
  /**
   * List available models from this provider
   */
  abstract listModels(): Promise<Model[]>;

  /**
   * Cleanup any resources used by the provider
   */
  async cleanup(): Promise<void> {
    // Default implementation does nothing
    // Providers can override this if they need cleanup
  }

  /**
   * Common configuration validation logic shared by all providers
   */
  validateCommonConfig(): void {
    if (!this.config.modelId) {
      throw new Error('Model ID is required');
    }

    // Validate temperature
    if (this.config.temperature !== undefined) {
      if (this.config.temperature < 0 || this.config.temperature > 1) {
        throw new Error('Temperature must be between 0 and 1');
      }
    }

    // Validate topP
    if (this.config.topP !== undefined) {
      if (this.config.topP < 0 || this.config.topP > 1) {
        throw new Error('Top P must be between 0 and 1');
      }
    }
  }
}