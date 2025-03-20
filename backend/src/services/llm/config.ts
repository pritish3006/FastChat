import { z } from 'zod';
import { config } from '../../config';

// LLM Provider Schema
export const LLMProviderSchema = z.enum(['openai']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

// Model Schema
export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: LLMProviderSchema,
  contextWindow: z.number(),
  maxTokens: z.number(),
  inputCostPer1kTokens: z.number(),
  outputCostPer1kTokens: z.number(),
  supportsStreaming: z.boolean(),
  supportsFunctionCalling: z.boolean(),
  supportsVision: z.boolean(),
  supportsAudio: z.boolean(),
  supportsEmbeddings: z.boolean(),
  maxInputTokens: z.number(),
  maxOutputTokens: z.number(),
  defaultTemperature: z.number(),
  defaultTopP: z.number(),
  defaultFrequencyPenalty: z.number(),
  defaultPresencePenalty: z.number(),
  defaultStop: z.array(z.string()).optional(),
  defaultSystemPrompt: z.string().optional(),
  capabilities: z.array(z.string()),
  description: z.string(),
  lastUpdated: z.string(),
  isActive: z.boolean(),
  isDeprecated: z.boolean(),
  deprecationDate: z.string().optional(),
  replacementModel: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Model = z.infer<typeof ModelSchema>;

// Provider-specific schemas
export const OpenAIModelSchema = ModelSchema.extend({
  provider: z.literal('openai'),
  supportsFunctionCalling: z.literal(true),
  supportsVision: z.literal(true),
  supportsAudio: z.literal(true),
  supportsEmbeddings: z.literal(true),
});

export type OpenAIModel = z.infer<typeof OpenAIModelSchema>;

// Available models
export const AVAILABLE_MODELS: Record<string, OpenAIModel> = {
  'gpt-4-turbo-preview': {
    id: 'gpt-4-turbo-preview',
    name: 'GPT-4 Turbo',
    provider: 'openai',
    contextWindow: 128000,
    maxTokens: 4096,
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsAudio: true,
    supportsEmbeddings: true,
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
    defaultFrequencyPenalty: 0,
    defaultPresencePenalty: 0,
    defaultSystemPrompt: 'You are a helpful assistant.',
    capabilities: [
      'chat',
      'completion',
      'function-calling',
      'vision',
      'audio',
      'embeddings'
    ],
    description: 'Most capable GPT-4 model, optimized for speed.',
    lastUpdated: '2024-03-19',
    isActive: true,
    isDeprecated: false,
    metadata: {
      releaseDate: '2024-03-19',
      trainingData: 'Up to Dec 2023',
      capabilities: {
        vision: true,
        audio: true,
        functionCalling: true,
        embeddings: true
      }
    }
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextWindow: 16385,
    maxTokens: 4096,
    inputCostPer1kTokens: 0.0005,
    outputCostPer1kTokens: 0.0015,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsVision: true,
    supportsAudio: true,
    supportsEmbeddings: true,
    maxInputTokens: 16385,
    maxOutputTokens: 4096,
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
    defaultFrequencyPenalty: 0,
    defaultPresencePenalty: 0,
    defaultSystemPrompt: 'You are a helpful assistant.',
    capabilities: [
      'chat',
      'completion',
      'function-calling',
      'vision',
      'audio',
      'embeddings'
    ],
    description: 'Most capable GPT-3.5 model, optimized for speed.',
    lastUpdated: '2024-03-19',
    isActive: true,
    isDeprecated: false,
    metadata: {
      releaseDate: '2024-03-19',
      trainingData: 'Up to Dec 2023',
      capabilities: {
        vision: true,
        audio: true,
        functionCalling: true,
        embeddings: true
      }
    }
  },
  'o3-mini': {
    id: 'o3-mini',
    name: 'OpenAI o3-mini',
    provider: 'openai',
    contextWindow: 4096,
    maxTokens: 4096,
    inputCostPer1kTokens: 0.0004,
    outputCostPer1kTokens: 0.0004,
    supportsStreaming: true,
    supportsFunctionCalling: true,
    supportsEmbeddings: true,
    maxInputTokens: 2048,
    maxOutputTokens: 2048,
    defaultTemperature: 0.7,
    defaultTopP: 1.0,
    defaultFrequencyPenalty: 0.0,
    defaultPresencePenalty: 0.0,
    defaultStop: [],
    defaultSystemPrompt: 'You are a helpful assistant.',
    capabilities: ['text-completion', 'streaming'],
    description: 'OpenAI o3-mini model for cost-effective operations.',
    lastUpdated: new Date().toISOString(),
    isActive: true,
    isDeprecated: false,
  },
};

// Provider-specific configurations
export const PROVIDER_CONFIGS = {
  openai: {
    apiKey: config.llm.openaiApiKey,
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: config.llm.defaultModel,
    maxRetries: 3,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.openaiApiKey}`
    }
  }
} as const;

// Default model configuration
export const DEFAULT_MODEL_CONFIG = {
  temperature: config.llm.temperature,
  topP: config.llm.topP,
  maxTokens: config.llm.maxTokens,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: undefined as string[] | undefined,
  systemPrompt: 'You are a helpful assistant.'
} as const;

// Model validation
export function validateModel(modelId: string): OpenAIModel {
  const model = AVAILABLE_MODELS[modelId];
  if (!model) {
    throw new Error(`Model ${modelId} not found. Available models: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
  }
  return model;
}

// Provider validation
export function validateProvider(provider: string): LLMProvider {
  if (!LLMProviderSchema.safeParse(provider).success) {
    throw new Error(`Invalid LLM provider: ${provider}. Must be one of: ${LLMProviderSchema.options.join(', ')}`);
  }
  return provider as LLMProvider;
}