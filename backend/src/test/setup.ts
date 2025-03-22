/// <reference lib="dom" />
import { jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { LLMService } from '../services/llm';
import { RedisMemory } from '../services/llm/memory/redis';
import { config } from '../config';

// Mock fetch globally
const mockFetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
  return Promise.resolve(new Response());
});

global.fetch = mockFetch;

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Mock console.error to keep test output clean
console.error = jest.fn();

// Extend timeout for integration tests
jest.setTimeout(30000);

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    disconnect: jest.fn()
  }));
});

// Mock config
jest.mock('../config', () => ({
  config: {
    llm: {
      provider: 'openai',
      defaultModel: 'gpt-3.5-turbo',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 2000
    },
    search: {
      tavilyApiKey: 'test-tavily-key'
    },
    voice: {
      ttsApiKey: 'test-tts-key',
      sttApiKey: 'test-stt-key'
    }
  }
}));

// Global setup
beforeAll(() => {
  // Initialize any global test dependencies
});

afterAll(() => {
  // Cleanup any global test dependencies
});

// Mock global services
global.redisManager = new RedisMemory({
  enabled: true,
  url: 'redis://localhost:6379',
  prefix: 'test:',
  sessionTTL: 3600
});

global.llmService = new LLMService({
  model: {
    baseURL: 'http://localhost:11434',
    provider: 'ollama',
    modelId: 'llama2'
  }
}); 