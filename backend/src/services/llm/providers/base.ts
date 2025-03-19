import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseModelProvider, ModelConfig, StreamController } from '../types';
import { EventEmitter } from 'events';
import { createLangChainModel } from './index';

export abstract class BaseProvider implements BaseModelProvider {
  protected model: BaseChatModel | null = null;
  modelId?: string;

  abstract initialize(config: ModelConfig): Promise<BaseChatModel>;

  validateConfig(config: ModelConfig): void {
    if (!config.modelId) {
      throw new Error('Model ID is required');
    }

    this.modelId = config.modelId;

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
  }

  protected validateProviderSpecificConfig(_config: ModelConfig): void {
    // To be implemented by specific providers
  }

  /**
   * Generates a chat completion with optional streaming support
   */
  async generateChatCompletion(params: {
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  }): Promise<{ text: string } | StreamController> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      if (params.stream) {
        // Handle streaming responses
        const streamController = new EventEmitter() as StreamController;
        streamController.abort = () => {}; // Default no-op abort function
        
        // For real implementations, you would use the model's streaming capabilities
        // This is a placeholder that just sends the full response at once
        setTimeout(async () => {
          try {
            // Convert to non-streaming and emit chunks
            const nonStreamParams = { ...params, stream: false };
            const response = await this.generateChatCompletion(nonStreamParams) as { text: string };
            
            // Simulate streaming by sending one character at a time
            const text = response.text || '';
            const chunkSize = 5; // Characters per chunk
            
            for (let i = 0; i < text.length; i += chunkSize) {
              const chunk = text.substring(i, i + chunkSize);
              streamController.emit('chunk', { text: chunk });
              
              // Slow down emission for testing
              await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Emit done event
            streamController.emit('done');
          } catch (error) {
            streamController.emit('error', error);
          }
        }, 0);
        
        return streamController;
      } else {
        // Handle non-streaming response
        // This is a simplified implementation
        // In a real provider, you would call the model's predict or similar method
        let inputText = params.messages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        if (params.systemPrompt) {
          inputText = `system: ${params.systemPrompt}\n${inputText}`;
        }
        
        // Use the LangChain model to generate a response
        const response = await this.model.invoke(inputText);
        
        return {
          text: typeof response === 'string' ? response : JSON.stringify(response)
        };
      }
    } catch (error) {
      console.error('Error in generateChatCompletion:', error);
      throw error;
    }
  }

  /**
   * Creates a LangChain compatible model
   */
  asLangChainModel(options: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
  } = {}): BaseChatModel {
    // Use the adapter function to create a LangChain model
    return createLangChainModel(this, options);
  }
} 