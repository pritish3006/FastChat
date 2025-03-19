import { jest, describe, beforeEach, afterEach, beforeAll, it, expect } from '@jest/globals';
import { ModelProviderFactory } from '../providers';
import { OllamaProvider } from '../providers/ollama';
import { BaseModelProvider, ModelConfig, StreamController } from '../types';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

// Use real Ollama instance
const OLLAMA_BASE_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';

// Function to get available models
async function getAvailableModel(): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    const data = await response.json();
    const models = data.models || [];
    if (models.length === 0) {
      throw new Error('No models available in Ollama');
    }
    // Return the first available model
    return models[0].name;
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

describe('Model Provider Integration Tests', () => {
  let TEST_MODEL: string;

  beforeAll(async () => {
    TEST_MODEL = await getAvailableModel();
    console.log(`Using model: ${TEST_MODEL}`);
  });

  beforeEach(() => {
    ModelProviderFactory.clearProviders();
  });

  afterEach(() => {
    ModelProviderFactory.clearProviders();
  });

  describe('ModelProviderFactory', () => {
    it('should create an Ollama provider', () => {
      const config: ModelConfig = {
        provider: 'ollama',
        modelId: TEST_MODEL,
        baseUrl: OLLAMA_BASE_URL
      };

      const provider = ModelProviderFactory.getProvider(config);
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should reuse existing provider instances', () => {
      const config: ModelConfig = {
        provider: 'ollama',
        modelId: TEST_MODEL,
        baseUrl: OLLAMA_BASE_URL
      };

      const provider1 = ModelProviderFactory.getProvider(config);
      const provider2 = ModelProviderFactory.getProvider(config);
      expect(provider1).toBe(provider2);
    });

    it('should throw error for unsupported provider', () => {
      const config: ModelConfig = {
        provider: 'unsupported' as any,
        modelId: TEST_MODEL,
        baseUrl: OLLAMA_BASE_URL
      };

      expect(() => ModelProviderFactory.getProvider(config)).toThrow('Unsupported provider');
    });
  });

  describe('OllamaProvider', () => {
    let provider: BaseModelProvider;
    let validConfig: ModelConfig;

    beforeEach(() => {
      provider = new OllamaProvider();
      validConfig = {
        provider: 'ollama',
        modelId: TEST_MODEL,
        baseUrl: OLLAMA_BASE_URL,
        temperature: 0.7
      };
    });

    describe('Configuration Validation', () => {
      it('should validate correct configuration', () => {
        expect(() => provider.validateConfig(validConfig)).not.toThrow();
      });

      it('should throw error for missing model ID', () => {
        const invalidConfig = { ...validConfig, modelId: undefined };
        expect(() => provider.validateConfig(invalidConfig as any)).toThrow('Model ID is required');
      });

      it('should throw error for invalid temperature', () => {
        const invalidConfig = { ...validConfig, temperature: 1.5 };
        expect(() => provider.validateConfig(invalidConfig)).toThrow('Temperature must be between 0 and 1');
      });

      it('should throw error for invalid base URL', () => {
        const invalidConfig = { ...validConfig, baseUrl: 'not-a-url' };
        expect(() => provider.validateConfig(invalidConfig)).toThrow('Invalid base URL');
      });
    });

    describe('Model Initialization', () => {
      it('should initialize ChatOllama model', async () => {
        const model = await provider.initialize(validConfig);
        expect(model).toBeInstanceOf(ChatOllama);
      }, 30000); // Increased timeout for real model initialization

      it('should set correct model parameters', async () => {
        const model = await provider.initialize(validConfig) as ChatOllama;
        expect(model.temperature).toBe(validConfig.temperature);
        expect(model.model).toBe(validConfig.modelId);
      }, 30000);
    });

    describe('LangChain Integration', () => {
      beforeEach(async () => {
        await provider.initialize(validConfig);
      }, 30000);

      it('should create LangChain model with default options', () => {
        const model = provider.asLangChainModel();
        expect(model).toBeDefined();
        expect(model._llmType()).toBe('fast-chat-model-adapter');
      });

      it('should create LangChain model with custom options', () => {
        const options = {
          temperature: 0.5,
          maxTokens: 500,
          streaming: false
        };
        const model = provider.asLangChainModel(options);
        expect(model).toBeDefined();
      });
    });

    describe('Message Generation', () => {
      beforeEach(async () => {
        await provider.initialize(validConfig);
      }, 30000);

      it('should handle chat completion request', async () => {
        const result = await provider.generateChatCompletion({
          messages: [{ role: 'user', content: 'What is 2+2?' }],
          stream: false
        });

        if ('text' in result) {
          expect(typeof result.text).toBe('string');
          expect(result.text.length).toBeGreaterThan(0);
        } else {
          throw new Error('Expected non-streaming response');
        }
      }, 30000);

      it('should handle system prompts', async () => {
        const result = await provider.generateChatCompletion({
          messages: [{ role: 'user', content: 'What is your purpose?' }],
          systemPrompt: 'You are a helpful math tutor who loves numbers',
          stream: false
        });

        if ('text' in result) {
          expect(typeof result.text).toBe('string');
          expect(result.text.length).toBeGreaterThan(0);
        } else {
          throw new Error('Expected non-streaming response');
        }
      }, 30000);

      it('should handle streaming responses', async () => {
        const result = await provider.generateChatCompletion({
          messages: [{ role: 'user', content: 'Count from 1 to 3' }],
          stream: true
        });

        if (!('on' in result)) {
          throw new Error('Expected streaming response');
        }

        // Test actual streaming
        let receivedChunks = 0;
        let fullResponse = '';

        await new Promise((resolve, reject) => {
          result.on('data', (chunk: any) => {
            receivedChunks++;
            if (chunk.response) {
              fullResponse += chunk.response;
            }
          });

          result.on('end', () => {
            expect(receivedChunks).toBeGreaterThan(0);
            expect(fullResponse.length).toBeGreaterThan(0);
            resolve(true);
          });

          result.on('error', (error) => {
            reject(error);
          });

          // Set a timeout just in case
          setTimeout(() => {
            reject(new Error('Stream timeout'));
          }, 20000);
        });
      }, 30000);
    });
  });
}); 