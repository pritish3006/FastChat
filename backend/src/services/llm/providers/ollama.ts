import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseProvider } from './base';
import { ModelConfig } from '../types';
import logger from '../../../utils/logger';
import { Serialized } from '@langchain/core/load/serializable';

export class OllamaProvider extends BaseProvider {
  async initialize(config: ModelConfig): Promise<BaseChatModel> {
    logger.info('Initializing Ollama provider with config:', {
      modelId: config.modelId,
      baseUrl: config.baseUrl,
      temperature: config.temperature,
      topP: config.topP
    });

    this.validateConfig(config);
    this.validateProviderSpecificConfig(config);

    const model = new ChatOllama({
      baseUrl: config.baseUrl,
      model: config.modelId,
      temperature: config.temperature,
      topP: config.topP,
      disableStreaming: false,
      callbacks: [{
        handleLLMNewToken(token: string) {
          logger.debug('Ollama raw token received:', { token });
        },
        handleLLMStart(
          llm: Serialized,
          prompts: string[],
          runId: string,
          parentRunId?: string,
          extraParams?: Record<string, unknown>
        ) {
          logger.info('Ollama stream starting:', { 
            model: llm.id || llm.name,
            promptCount: prompts.length,
            runId
          });
        },
        handleLLMEnd(output) {
          logger.info('Ollama stream ended:', { output });
        },
        handleLLMError(err: Error) {
          logger.error('Ollama stream error:', err);
        }
      }]
    });

    logger.info('Ollama model initialized:', { modelId: config.modelId });
    this.model = model;
    return model;
  }

  protected validateProviderSpecificConfig(config: ModelConfig): void {
    logger.debug('Validating Ollama provider config');
    
    if (!config.baseUrl) {
      throw new Error('Base URL is required for Ollama provider');
    }

    try {
      new URL(config.baseUrl);
    } catch (error) {
      throw new Error('Invalid base URL provided for Ollama provider');
    }
    
    logger.debug('Ollama provider config validation successful');
  }
} 