// @ts-nocheck
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseProvider, ChatCompletionResponse, Model, StreamController } from './base';
import { ModelConfig, StreamChunk, StreamOptions, StreamCallbacks, ChatCompletionParams } from '../types';
import logger from '../../../utils/logger';
import { ollamaService, OllamaCompletionRequest } from '../ollama';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { StreamingManager } from '../streaming';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Create a singleton instance of StreamingManager
const streamingManager = new StreamingManager();

// Define Ollama model interface locally
interface OllamaModel {
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

interface StreamingCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface StreamingOptions {
  temperature?: number;
  top_p?: number;
}

export class CustomChatModel extends BaseChatModel {
  private modelId: string;
  private baseUrl: string;
  private temperature: number;
  private topP: number;

  constructor(config: {
    modelId: string;
    baseUrl: string;
    temperature?: number;
    topP?: number;
  }) {
    super({});
    this.modelId = config.modelId;
    this.baseUrl = config.baseUrl;
    this.temperature = config.temperature ?? 0.7;
    this.topP = config.topP ?? 0.9;
  }

  _llmType(): string {
    return "custom-ollama";
  }

  async _generate(messages: BaseMessage[], options: any, runManager?: any): Promise<any> {
    const prompt = messages.map(m => {
      const content = m.content;
      return typeof content === 'string' ? content : JSON.stringify(content);
    }).join('\n');
    
    const systemMessage = messages.find(m => m._getType() === 'system');
    const systemPrompt = systemMessage?.content;
    const systemPromptStr = typeof systemPrompt === 'string' ? systemPrompt : systemPrompt ? JSON.stringify(systemPrompt) : undefined;

    logger.debug('Generating response with:', { 
      promptLength: prompt.length,
      hasSystemPrompt: !!systemPromptStr,
      options 
    });

    try {
      const connectionId = uuidv4();
      const sessionId = uuidv4();
      const messageId = uuidv4();
      const baseUrl = this.baseUrl;
      const modelId = this.modelId;
      const temperature = this.temperature;
      const topP = this.topP;

      let accumulatedContent = '';

      const progress = await streamingManager.streamResponse(
        connectionId,
        sessionId,
        messageId,
        (async function* () {
          logger.debug('Making request to Ollama API:', {
            modelId,
            hasSystemPrompt: !!systemPromptStr,
            temperature,
            topP
          });

          const response = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelId,
              prompt,
              system: systemPromptStr,
              stream: true,
              options: {
                temperature,
                top_p: topP
              }
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            const requestBody = {
              model: modelId,
              prompt,
              system: systemPromptStr,
              stream: true,
              options: {
                temperature,
                top_p: topP
              }
            };
            
            logger.error('Ollama API error:', {
              status: response.status,
              statusText: response.statusText,
              errorText,
              requestUrl: `${baseUrl}/api/generate`,
              requestBody,
              requestHeaders: {
                'Content-Type': 'application/json'
              },
              responseHeaders: Object.fromEntries(response.headers.entries())
            });
            throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body reader available');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                logger.debug('Ollama stream completed');
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              let newlineIndex;
              
              while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const chunk = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);

                if (chunk.trim()) {
                  try {
                    const data = JSON.parse(chunk);
                    if (data.response) {
                      logger.debug('Received token from Ollama:', { 
                        tokenLength: data.response.length,
                        tokenPreview: data.response.substring(0, 20)
                      });
                      yield data.response;
                    }
                  } catch (e) {
                    logger.warn('Failed to parse JSON chunk:', { chunk, error: e });
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        })(),
        {
          onStart: () => {
            logger.debug('Starting LLM generation');
            if (runManager) runManager.handleLLMStart({}, [prompt]);
          },
          onToken: (token: string) => {
            logger.debug('Processing token:', { 
              tokenLength: token.length,
              tokenPreview: token.substring(0, 20)
            });
            accumulatedContent += token;
            if (runManager) runManager.handleLLMNewToken(token);
          },
          onComplete: () => {
            logger.debug('Completed LLM generation:', { 
              totalLength: accumulatedContent.length 
            });
            if (runManager) runManager.handleLLMEnd({});
          },
          onError: (error: Error) => {
            logger.error('Error in LLM generation:', { error });
            if (runManager) runManager.handleLLMError(error);
          }
        }
      );

      // Create AIMessage only at the end with accumulated content
      const aiMessage = new AIMessage(accumulatedContent);
      logger.debug('Created final AIMessage:', { 
        contentLength: accumulatedContent.length,
        messageType: aiMessage._getType()
      });

      return {
        generations: [{
          text: accumulatedContent,
          message: aiMessage
        }]
      };
    } catch (error) {
      logger.error('Error in custom chat model:', error);
      throw error;
    }
  }
}

/**
 * Ollama provider implementation
 */
export class OllamaProvider extends BaseProvider {
  private baseURL: string = '';

  constructor(config: ModelConfig) {
    super(config);
    this.baseURL = config.baseURL || 'http://localhost:11434';
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    try {
      // Validate configuration
      await this.validateConfig();
      
      logger.info('Initializing Ollama provider', {
        baseURL: this.baseURL,
        modelId: this.modelId 
      });

      // No explicit client initialization needed for Ollama
      logger.info('Ollama provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Ollama provider', {
        error: error instanceof Error ? error.message : String(error),
        modelId: this.modelId
        });
        throw error;
      }
  }

  /**
   * Validate the provider configuration
   */
  async validateConfig(): Promise<void> {
    // Validate common config
    this.validateCommonConfig();
    
    // Validate Ollama-specific config
    if (!this.baseURL) {
      throw new Error('Ollama base URL is required');
    }
    
    try {
      // Check if the URL is valid
      new URL(this.baseURL);
    } catch (error) {
      throw new Error(`Invalid Ollama base URL: ${this.baseURL}`);
    }
  }

  /**
   * Stream chat completion tokens
   */
  async *streamChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: StreamOptions,
    callbacks?: StreamCallbacks
  ): AsyncGenerator<StreamChunk> {
    try {
      // Map OpenAI-style messages to Ollama format
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : ''
      }));
      
      // Extract system prompt if present
      let systemPrompt: string | undefined;
      const userMessages = formattedMessages.filter(msg => {
        if (msg.role === 'system') {
          systemPrompt = msg.content;
          return false;
        }
        return true;
      });
      
      // Create a prompt from the messages
      const prompt = userMessages.map(msg => {
        if (msg.role === 'user') {
          return `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          return `Assistant: ${msg.content}\n`;
        }
        return '';
      }).join('');
      
      // Create Ollama completion request
      const request: OllamaCompletionRequest = {
        model: this.modelId,
        prompt,
        stream: true,
        options: {
          temperature: options?.temperature,
          top_p: options?.topP,
          top_k: options?.topK,
          num_ctx: options?.maxTokens
        },
        system: systemPrompt
      };
      
      // Yield the first chunk to indicate start
      yield {
        type: 'token',
        content: '',
        metadata: { model: this.modelId }
      };
      
      // Start streaming using a Promise-based approach
      const streamController = await ollamaService.generateCompletion(request, this.baseURL);
      
      // Set up async iteration using promises and events
      let resolveNextChunk: ((value: StreamChunk) => void) | null = null;
      let rejectNextChunk: ((reason: any) => void) | null = null;
      
      // Function to get the next token
      const getNextChunk = () => {
        return new Promise<StreamChunk>((resolve, reject) => {
          resolveNextChunk = resolve;
          rejectNextChunk = reject;
        });
      };
      
      // Set up event handlers
      streamController.on('data', (data) => {
        if (data.response && resolveNextChunk) {
          resolveNextChunk({
            type: 'token',
            content: data.response,
            metadata: {}
          });
        }
      });
      
      streamController.on('end', () => {
        if (resolveNextChunk) {
          resolveNextChunk({
            type: 'complete',
            metadata: {}
          });
          resolveNextChunk = null;
        }
      });
      
      streamController.on('error', (error) => {
        if (rejectNextChunk) {
          rejectNextChunk(error);
          rejectNextChunk = null;
        }
      });
      
      // Async iteration
      try {
        while (true) {
          const chunk = await getNextChunk();
          yield chunk;
          
          if (chunk.type === 'complete') {
            break;
          }
        }
      } catch (error) {
        yield {
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
      
    } catch (error) {
      logger.error('Error setting up Ollama stream', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      yield {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Generate a chat completion
   */
  async generateChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse | StreamController> {
    try {
      // Extract parameters
      const { messages, systemPrompt, temperature, maxTokens, topP, stream } = params;
      
      // Format messages for Ollama
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : ''
      }));
      
      // Create prompt from messages
      const prompt = formattedMessages
        .filter(msg => msg.role !== 'system')
        .map(msg => {
          if (msg.role === 'user') {
            return `User: ${msg.content}\n`;
          } else if (msg.role === 'assistant') {
            return `Assistant: ${msg.content}\n`;
          }
          return '';
        }).join('');
      
      // Extract system prompt if present in messages
      let sysPrompt = systemPrompt;
      if (!sysPrompt) {
        const systemMsg = formattedMessages.find(msg => msg.role === 'system');
        if (systemMsg) {
          sysPrompt = systemMsg.content;
        }
      }
      
      // Create Ollama completion request
      const request: OllamaCompletionRequest = {
        model: this.modelId,
        prompt,
        stream: stream === true,
        options: {
          temperature,
          top_p: topP,
          num_ctx: maxTokens
        },
        system: sysPrompt
      };
      
      // If streaming is requested, return a StreamController
      if (stream) {
        return ollamaService.generateCompletion(request, this.baseURL);
      } else {
        // For non-streaming, collect the full response
        const streamController = await ollamaService.generateCompletion(request, this.baseURL);
        
        return new Promise<ChatCompletionResponse>((resolve, reject) => {
          let fullResponse = '';
          
          streamController.on('data', (data) => {
            if (data.response) {
              fullResponse += data.response;
            }
          });
          
          streamController.on('end', () => {
            resolve({ text: fullResponse });
          });
          
          streamController.on('error', (error) => {
            reject(error);
          });
        });
      }
    } catch (error) {
      logger.error('Error generating chat completion', {
        error: error instanceof Error ? error.message : String(error),
        modelId: this.modelId
      });
      throw error;
    }
  }

  /**
   * List available models from this provider
   */
  async listModels(): Promise<Model[]> {
    try {
      const ollamaModels = await ollamaService.listModels(this.baseURL);
      
      return ollamaModels.map(model => ({
        id: model.name,
        name: model.name,
        contextLength: 4096 // Default context length, could be retrieved from model metadata
      }));
    } catch (error) {
      logger.error('Error listing Ollama models', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Cleanup Ollama resources
   */
  async cleanup(): Promise<void> {
    // Ollama doesn't require explicit cleanup
    // But we'll clear any references
    this.baseURL = '';
  }
} 