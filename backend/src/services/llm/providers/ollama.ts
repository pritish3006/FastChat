import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseProvider } from './base';
import { ModelConfig } from '../types';

export class OllamaProvider extends BaseProvider {
  async initialize(config: ModelConfig): Promise<BaseChatModel> {
    this.validateConfig(config);
    this.validateProviderSpecificConfig(config);

    const model = new ChatOllama({
      baseUrl: config.baseUrl,
      model: config.modelId,
      temperature: config.temperature,
      topP: config.topP,
    });

    this.model = model;
    return model;
  }

  protected validateProviderSpecificConfig(config: ModelConfig): void {
    if (!config.baseUrl) {
      throw new Error('Base URL is required for Ollama provider');
    }

    try {
      new URL(config.baseUrl);
    } catch (error) {
      throw new Error('Invalid base URL provided for Ollama provider');
    }
  }
} 