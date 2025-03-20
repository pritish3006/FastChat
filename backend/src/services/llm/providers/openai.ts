import OpenAI from 'openai';
import { 
  ModelConfig, 
  StreamChunk, 
  StreamOptions, 
  StreamCallbacks, 
  ChatCompletionParams 
} from '../types';
import { 
  BaseProvider, 
  ChatCompletionResponse, 
  Model, 
  StreamController 
} from './base';
import { EventEmitter } from 'events';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ToolManager } from '../tools';
import logger from '../../../utils/logger';

/**
 * OpenAI provider implementation for the LLM service
 */
export class OpenAIProvider extends BaseProvider {
  private openai!: OpenAI;
  private toolManager: ToolManager;

  constructor(config: ModelConfig) {
    super(config);
    this.modelId = config.modelId;
    this.toolManager = new ToolManager();
  }

  /**
   * Initialize the OpenAI client
   */
  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.openai = new OpenAI({ apiKey: this.config.apiKey }); // Initialize OpenAI client
  }

  /**
   * Validate the OpenAI configuration
   */
  async validateConfig(): Promise<void> {
    this.validateCommonConfig();

    // OpenAI-specific validation
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  /**
   * Stream chat completion tokens from OpenAI
   */
  async *streamChatCompletion(
    messages: ChatCompletionMessageParam[],
    options?: StreamOptions,
    callbacks?: StreamCallbacks
  ): AsyncGenerator<StreamChunk> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      if (callbacks?.onStart) {
        callbacks.onStart();
      }

      const stream = await this.openai.chat.completions.create({
        model: this.modelId,
        messages,
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        top_p: options?.topP ?? this.config.topP,
        stream: true,
        tools: options?.enableTools ? this.toolManager.getToolDefinitions() : undefined,
        tool_choice: options?.enableTools ? 'auto' : 'none'
      });

      let currentToolCall: any = null;

      for await (const chunk of stream) {
        // Handle tool calls
        if (chunk.choices[0]?.delta?.tool_calls?.[0]) {
          const toolCall = chunk.choices[0].delta.tool_calls[0];
          
          if (toolCall.function) {
            if (toolCall.function.name) {
              currentToolCall = {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: ''
              };
              // Emit tool start event
              yield {
                type: 'tool_start',
                metadata: {
                  tool: toolCall.function.name,
                  status: 'starting'
                }
              };
            }
            if (toolCall.function.arguments) {
              currentToolCall.arguments += toolCall.function.arguments;
            }
          }

          // If we have a complete tool call
          if (currentToolCall?.name && currentToolCall.arguments) {
            try {
              const args = JSON.parse(currentToolCall.arguments);
              
              // Emit tool execution status
              yield {
                type: 'tool_start',
                metadata: {
                  tool: currentToolCall.name,
                  status: 'executing'
                }
              };
              
              const result = await this.toolManager.executeFunction(currentToolCall.name, args);
              
              // Add tool result to messages and continue the conversation
              messages.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: currentToolCall.id,
                  type: 'function',
                  function: {
                    name: currentToolCall.name,
                    arguments: currentToolCall.arguments
                  }
                }]
              } as ChatCompletionMessageParam);
              
              messages.push({
                role: 'tool',
                content: JSON.stringify(result),
                tool_call_id: currentToolCall.id
              } as ChatCompletionMessageParam);

              // Emit tool completion
              yield {
                type: 'tool_end',
                metadata: {
                  tool: currentToolCall.name,
                  status: 'completed'
                }
              };

              // Start a new completion with the tool results
              const newStream = await this.openai.chat.completions.create({
                model: this.modelId,
                messages,
                temperature: options?.temperature ?? this.config.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
                stream: true
              });

              // Yield the new stream's content
              for await (const newChunk of newStream) {
                const content = newChunk.choices[0]?.delta?.content;
                if (content) {
                  if (callbacks?.onToken) callbacks.onToken(content);
                  yield { type: 'token', content };
                }
              }

              currentToolCall = null;
              continue;
            } catch (error) {
              logger.error('Tool execution failed', {
                tool: currentToolCall.name,
                error: error instanceof Error ? error.message : String(error)
              });
              yield {
                type: 'error',
                error: error as Error,
                metadata: {
                  tool: currentToolCall.name,
                  status: 'failed'
                }
              };
              currentToolCall = null;
            }
          }
          continue;
        }

        // Handle normal content
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          if (callbacks?.onToken) callbacks.onToken(content);
          yield { type: 'token', content };
        }
      }

      if (callbacks?.onComplete) {
        callbacks.onComplete();
      }

      yield { type: 'complete' };
    } catch (error) {
      if (callbacks?.onError) {
        callbacks.onError(error as Error);
      }
      yield {
        type: 'error',
        error: error as Error
      };
    }
  }

  /**
   * Generate a chat completion with OpenAI
   */
  async generateChatCompletion(
    params: ChatCompletionParams
  ): Promise<ChatCompletionResponse | StreamController> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    let messages = [...params.messages];
    if (params.systemPrompt) {
      messages.unshift({
        role: 'system',
        content: params.systemPrompt
      });
    }

    if (params.stream) {
      const streamController = new EventEmitter() as StreamController;
      let aborted = false;
      
      if (params.signal) {
        params.signal.addEventListener('abort', () => {
          aborted = true;
          streamController.emit('error', new Error('Request aborted'));
        });
      }
      
      streamController.abort = () => {
        aborted = true;
        streamController.emit('error', new Error('Stream aborted'));
      };
      
      (async () => {
        try {
          const stream = await this.openai.chat.completions.create({
            model: params.model || this.modelId,
            messages: messages as ChatCompletionMessageParam[],
            temperature: params.temperature ?? this.config.temperature ?? 0.7,
            max_tokens: params.maxTokens ?? this.config.maxTokens,
            stream: true,
            tools: params.enableTools ? this.toolManager.getToolDefinitions() : undefined,
            tool_choice: params.enableTools ? 'auto' : 'none'
          });

          let currentToolCall: any = null;

          for await (const chunk of stream) {
            if (aborted) break;

            // Handle tool calls
            if (chunk.choices[0]?.delta?.tool_calls?.[0]) {
              const toolCall = chunk.choices[0].delta.tool_calls[0];
              
              if (toolCall.function) {
                if (toolCall.function.name) {
                  currentToolCall = {
                    id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: ''
                  };
                }
                if (toolCall.function.arguments) {
                  currentToolCall.arguments += toolCall.function.arguments;
                }
              }

              // If we have a complete tool call
              if (currentToolCall?.name && currentToolCall.arguments) {
                try {
                  const args = JSON.parse(currentToolCall.arguments);
                  const result = await this.toolManager.executeFunction(currentToolCall.name, args);
                  
                  // Add tool result to messages and continue the conversation
                  messages.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: currentToolCall.id,
                      type: 'function',
                      function: {
                        name: currentToolCall.name,
                        arguments: currentToolCall.arguments
                      }
                    }]
                  } as ChatCompletionMessageParam);
                  
                  messages.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: currentToolCall.id
                  } as ChatCompletionMessageParam);

                  // Start a new completion with the tool results
                  const newStream = await this.openai.chat.completions.create({
                    model: params.model || this.modelId,
                    messages: messages as ChatCompletionMessageParam[],
                    temperature: params.temperature ?? this.config.temperature ?? 0.7,
                    max_tokens: params.maxTokens ?? this.config.maxTokens,
                    stream: true
                  });

                  // Emit the new stream's content
                  for await (const newChunk of newStream) {
                    if (aborted) break;
                    const content = newChunk.choices[0]?.delta?.content;
                    if (content) {
                      streamController.emit('chunk', { text: content });
                    }
                  }

                  currentToolCall = null;
                  continue;
                } catch (error) {
                  logger.error('Tool execution failed', {
                    tool: currentToolCall.name,
                    error: error instanceof Error ? error.message : String(error)
                  });
                  if (!aborted) {
                    streamController.emit('error', error);
                  }
                  currentToolCall = null;
                }
              }
              continue;
            }

            // Handle normal content
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              streamController.emit('chunk', { text: content });
            }
          }
          
          if (!aborted) {
            streamController.emit('done');
          }
        } catch (error) {
          if (!aborted) {
            streamController.emit('error', error);
          }
        }
      })();
      
      return streamController;
    } else {
      // Non-streaming completion
      const completion = await this.openai.chat.completions.create({
        model: params.model || this.modelId,
        messages: messages as ChatCompletionMessageParam[],
        temperature: params.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? this.config.maxTokens,
        tools: params.enableTools ? this.toolManager.getToolDefinitions() : undefined,
        tool_choice: params.enableTools ? 'auto' : 'none'
      });

      // Handle tool calls in non-streaming mode
      if (completion.choices[0]?.message?.tool_calls?.[0]) {
        const toolCall = completion.choices[0].message.tool_calls[0];
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await this.toolManager.executeFunction(toolCall.function.name, args);
          
          // Add tool result to messages and continue the conversation
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: [toolCall]
          } as ChatCompletionMessageParam);
          
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id
          } as ChatCompletionMessageParam);

          // Get final response with tool results
          const finalCompletion = await this.openai.chat.completions.create({
            model: params.model || this.modelId,
            messages: messages as ChatCompletionMessageParam[],
            temperature: params.temperature ?? this.config.temperature ?? 0.7,
            max_tokens: params.maxTokens ?? this.config.maxTokens
          });

          return {
            text: finalCompletion.choices[0]?.message?.content || ''
          };
        } catch (error) {
          logger.error('Tool execution failed', {
            tool: toolCall.function.name,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      }

      return {
        text: completion.choices[0]?.message?.content || ''
      };
    }
  }

  /**
   * List available models from OpenAI
   */
  async listModels(): Promise<Model[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const models = await this.openai.models.list();
    
    return models.data
      .filter(model => model.id.includes('gpt'))
      .map(model => ({
        id: model.id,
        name: model.id,
        contextLength: this.getContextWindow(model.id),
      }));
  }

  /**
   * Get context window size for a given model
   */
  private getContextWindow(modelId: string): number {
    // Default context windows for known models
    const contextWindows: Record<string, number> = {
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-turbo': 128000,
      'gpt-4o': 128000,
    };

    // Try exact match
    if (contextWindows[modelId]) {
      return contextWindows[modelId];
    }

    // Try partial match
    for (const [key, value] of Object.entries(contextWindows)) {
      if (modelId.includes(key)) {
        return value;
      }
    }

    // Default fallback
    return 4096;
  }

  /**
   * Cleanup OpenAI resources
   */
  async cleanup(): Promise<void> {
    // OpenAI client doesn't require explicit cleanup
    // But we'll clear the client reference
    this.openai = null as any;
  }
} 