import { Model, GetModelConfigResponse, UpdateModelConfigResponse } from './types';

const mockModels: Model[] = [
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast and efficient for most tasks',
    parameters: {
      contextLength: 4096,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      pricing: {
        inputTokens: 0.5,
        outputTokens: 1.5
      }
    }
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4 Mini with Tools',
    provider: 'openai',
    description: 'Advanced model with web search and function calling',
    parameters: {
      contextLength: 200000,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      pricing: {
        inputTokens: 1.1,
        outputTokens: 4.4
      },
      benchmarks: {
        aime: '87.3%',
        gpqaDiamond: '79.7%',
        codeforces: '2130 Elo',
        sweBench: '49.3%'
      }
    }
  },
];

const defaultConfig = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxTokens: 2048,
  stopSequences: ['\n\n', '###'],
};

export const mockResponses = {
  getModels(): Model[] {
    return mockModels;
  },

  getModelConfig(): GetModelConfigResponse {
    return {
      success: true,
      data: {
        config: defaultConfig,
      }
    };
  },

  updateModelConfig(): UpdateModelConfigResponse {
    return {
      success: true,
      data: {
        config: defaultConfig,
      }
    };
  },
}; 