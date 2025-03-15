import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseModelProvider, ModelConfig } from '../types';

export abstract class BaseProvider implements BaseModelProvider {
  protected model: BaseChatModel | null = null;

  abstract initialize(config: ModelConfig): Promise<BaseChatModel>;

  validateConfig(config: ModelConfig): void {
    if (!config.modelId) {
      throw new Error('Model ID is required');
    }

    if (!config.provider) {
      throw new Error('Provider is required');
    }

    // Validate temperature
    if (config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 1) {
        throw new Error('Temperature must be between 0 and 1');
      }
    }

    // Validate topP
    if (config.topP !== undefined) {
      if (config.topP < 0 || config.topP > 1) {
        throw new Error('Top P must be between 0 and 1');
      }
    }

    // Validate maxTokens
    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      throw new Error('Max tokens must be greater than 0');
    }
  }

  protected validateProviderSpecificConfig(_config: ModelConfig): void {
    // To be implemented by specific providers
  }
} 