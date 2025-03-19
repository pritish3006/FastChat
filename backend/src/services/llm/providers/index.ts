import { BaseModelProvider, ModelConfig, StreamController } from '../types';
import { OllamaProvider } from './ollama';
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { EventEmitter } from 'events';

export class ModelProviderFactory {
  private static providers: Map<string, BaseModelProvider> = new Map();

  static getProvider(config: ModelConfig): BaseModelProvider {
    const provider = config.provider.toLowerCase();

    if (!this.providers.has(provider)) {
      switch (provider) {
        case 'ollama':
          this.providers.set(provider, new OllamaProvider());
          break;
        // Add more providers here as needed
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    }

    return this.providers.get(provider)!;
  }

  // For testing and cleanup
  static clearProviders(): void {
    this.providers.clear();
  }
}

/**
 * Create a LangChain model from a provider
 * This is a helper function to create a LangChain model from a provider
 */
export function createLangChainModel(
  provider: BaseModelProvider,
  options: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
  } = {}
): BaseChatModel {
  return new ModelAdapter(provider, options);
}

/**
 * adapter for model providers to langchain
 */
class ModelAdapter extends BaseChatModel {
  private provider: BaseModelProvider;
  private options: {
    temperature: number;
    maxTokens: number;
    streaming: boolean;
  };
  
  constructor(
    provider: BaseModelProvider,
    options: {
      temperature?: number;
      maxTokens?: number;
      streaming?: boolean;
    } = {}
  ) {
    super({});
    this.provider = provider;
    this.options = {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 1000,
      streaming: options.streaming ?? true
    };
  }
  
  _llmType(): string {
    return "fast-chat-model-adapter";
  }
  
  async _generate(
    messages: BaseMessage[],
    options: any,
    runManager?: any
  ): Promise<any> {
    // Convert LangChain messages to our format
    const formattedMessages = messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      
      if (msg._getType() === "human") {
        return { role: "user", content };
      } else if (msg._getType() === "ai") {
        return { role: "assistant", content };
      } else if (msg._getType() === "system") {
        return { role: "system", content };
      }
      return { role: "user", content };
    });
    
    // Extract system prompt if present
    let systemPrompt: string | undefined;
    const userMessages = formattedMessages.filter(msg => {
      if (msg.role === "system") {
        systemPrompt = msg.content;
        return false;
      }
      return true;
    });
    
    // Prepare completion request
    const request = {
      messages: userMessages,
      systemPrompt,
      model: this.provider.modelId,
      temperature: this.options.temperature,
      maxTokens: this.options.maxTokens,
      stream: this.options.streaming && !!runManager
    };
    
    try {
      // Handle streaming
      if (request.stream && runManager) {
        // Use stream API
        const streamController = await this.provider.generateChatCompletion(request) as StreamController;
        
        let fullText = "";
        
        // Set up handlers
        streamController.on("chunk", (chunk: any) => {
          if (chunk.text) {
            fullText += chunk.text;
            runManager?.handleLLMNewToken(chunk.text);
          }
        });
        
        // Wait for completion
        return new Promise((resolve, reject) => {
          streamController.on("done", () => {
            resolve({
              generations: [
                {
                  text: fullText,
                  message: new AIMessage(fullText)
                }
              ],
              llmOutput: {
                tokenUsage: {
                  promptTokens: this.estimateTokenCount(messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join("\n")),
                  completionTokens: this.estimateTokenCount(fullText),
                  totalTokens: 0
                }
              }
            });
          });
          
          streamController.on("error", (error: any) => {
            reject(error);
          });
        });
      } else {
        // Non-streaming mode
        const response = await this.provider.generateChatCompletion({
          ...request,
          stream: false
        }) as { text: string };
        
        const text = response.text || "";
        
        // Create LangChain response format
        return {
          generations: [
            {
              text,
              message: new AIMessage(text)
            }
          ],
          llmOutput: {
            tokenUsage: {
              promptTokens: this.estimateTokenCount(messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join("\n")),
              completionTokens: this.estimateTokenCount(text),
              totalTokens: 0
            }
          }
        };
      }
    } catch (error) {
      console.error("Error in LangChain model adapter", error);
      throw error;
    }
  }
  
  /**
   * estimate token count based on character heuristic
   */
  private estimateTokenCount(text: string): number {
    // Rough estimate: ~4 chars per token for English text
    return Math.ceil((text || "").length / 4);
  }
} 