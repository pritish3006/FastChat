// @ts-nocheck
/**
 * llm service
 * 
 * abstract provider interface for different llm backends.
 * handles model management, streaming, and provider selection.
 */

import { EventEmitter } from 'events';
import { ollamaService, StreamController } from './ollama';
import logger from '../../utils/logger';
import { config } from '../../config/index';
import { ApiError } from '../../middleware/errorHandler';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ModelProviderFactory } from './providers';
import { ChatParams, ChatResponse, LLMServiceConfig } from './types';

// generic model interface for any provider
export interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  maxTokens?: number;
  parameters?: Record<string, any>;
}

// request interface for llm completions
export interface CompletionRequest {
  prompt: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  user?: string;
  context?: any;
}

// chat message format
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

// llm service implementation
export const llmService = {
  // cached models list
  modelCache: null as Model[] | null,
  modelCacheExpiry: 0,
  
  /**
   * lists available models from all configured providers
   */
  async listModels(): Promise<Model[]> {
    try {
      // use cache if available and not expired (5 minutes)
      const now = Date.now();
      if (this.modelCache && this.modelCacheExpiry > now) {
        return this.modelCache;
      }
      
      // fetch models from ollama
      const ollamaModels = await ollamaService.listModels();
      
      // convert to generic model format
      const models: Model[] = ollamaModels.map(model => ({
        id: model.name,
        name: model.name,
        provider: 'ollama',
        description: `${model.details.family} (${model.details.parameter_size})`,
        parameters: {
          ...model.details
        }
      }));
      
      // add default model if it doesn't exist in models list
      const defaultModel = config.llm.defaultModel;
      if (defaultModel && !models.find(m => m.id === defaultModel)) {
        models.push({
          id: defaultModel,
          name: defaultModel,
          provider: 'ollama',
          description: 'Default model'
        });
      }
      
      // update cache
      this.modelCache = models;
      this.modelCacheExpiry = now + 5 * 60 * 1000; // 5 minutes
      
      return models;
    } catch (error) {
      logger.error('error fetching models', { error });
      throw new ApiError(502, 'failed to fetch available models');
    }
  },
  
  /**
   * get a specific model by id
   */
  async getModel(modelId: string): Promise<Model | null> {
    try {
      const models = await this.listModels();
      return models.find(model => model.id === modelId) || null;
    } catch (error) {
      logger.error('error fetching model', { error, modelId });
      return null;
    }
  },
  
  /**
   * generates a completion using the specified model with streaming
   * returns an event emitter that forwards events from the provider
   */
  async generateCompletion(
    request: CompletionRequest
  ): Promise<StreamController> {
    try {
      // find the model to determine provider
      const model = await this.getModel(request.model);
      
      if (!model) {
        const emitter = new EventEmitter() as StreamController;
        emitter.abort = () => {}; // dummy abort function
        emitter.emit('error', new ApiError(400, `model ${request.model} not found`));
        return emitter;
      }
      
      // route to appropriate provider
      if (model.provider === 'ollama') {
        return ollamaService.generateCompletion({
          model: model.id,
          prompt: request.prompt,
          stream: true,
          options: {
            temperature: request.temperature,
            top_p: request.topP,
            stop: request.stop,
          },
          system: request.systemPrompt,
          context: request.context,
        });
      }
      
      // provider not implemented
      const emitter = new EventEmitter() as StreamController;
      emitter.abort = () => {}; // dummy abort function
      emitter.emit('error', new ApiError(501, `provider ${model.provider} not implemented`));
      return emitter;
      
    } catch (error) {
      logger.error('error generating completion', { error, model: request.model });
      const emitter = new EventEmitter() as StreamController;
      emitter.abort = () => {}; // dummy abort function
      emitter.emit('error', error instanceof ApiError ? error : new ApiError(500, 'error generating completion'));
      return emitter;
    }
  },
  
  /**
   * converts an array of messages to a prompt string for non-chat models
   */
  messagesToPrompt(messages: ChatMessage[]): string {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        return `User: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}\n\n`;
      }
      return '';
    }).join('') + 'Assistant: ';
  }
};

export class LLMService {
  private config: LLMServiceConfig;
  private model: Awaited<ReturnType<typeof ModelProviderFactory.getProvider>>;

  constructor(config: LLMServiceConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const provider = ModelProviderFactory.getProvider(this.config.model);
    this.model = await provider.initialize(this.config.model);
  }

  async chat({ message, systemPrompt, callbacks }: ChatParams): Promise<ChatResponse> {
    if (!this.model) {
      throw new Error('LLM Service not initialized');
    }

    const messages = [];
    
    if (systemPrompt) {
      messages.push(new SystemMessage(systemPrompt));
    }
    
    messages.push(new HumanMessage(message));

    try {
      const response = await this.model.invoke(messages, {
        callbacks: callbacks ? {
          handleLLMNewToken: callbacks.onToken,
          handleLLMStart: callbacks.onStart,
          handleLLMEnd: callbacks.onComplete,
          handleLLMError: callbacks.onError,
        } : undefined,
      });

      return {
        text: response.content,
        metadata: {
          model: this.config.model.modelId,
          provider: this.config.model.provider,
        },
      };
    } catch (error) {
      throw new Error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 