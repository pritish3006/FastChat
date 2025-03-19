/// <reference lib="dom" />
import { jest, beforeEach } from '@jest/globals';
import { LLMService } from '../services/llm';
import { RedisManager } from '../services/llm/memory/redis';

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

// Mock global services
global.redisManager = new RedisManager({
  enabled: true,
  url: 'redis://localhost:6379',
  prefix: 'test:',
  sessionTTL: 3600
});

global.llmService = new LLMService({
  model: {
    provider: 'ollama',
    modelId: 'llama2',
    baseUrl: 'http://localhost:11434'
  }
}); 