import { RedisConfig } from '../../memory/redis';

export const mockRedisConfig: RedisConfig = {
  enabled: true,
  url: 'redis://localhost:6379',
  prefix: 'test',
};

// Mock Redis Client
export const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  lrange: jest.fn(),
  lpush: jest.fn(),
  del: jest.fn(),
};

// Mock Vector Store
export const mockVectorStore = {
  addDocument: jest.fn(),
  search: jest.fn(),
  delete: jest.fn(),
};

// Mock Embedding Service Config
export const mockEmbeddingConfig = {
  apiUrl: 'http://localhost:8000',
  model: 'test-model',
  dimensions: 384,
};

// Mock Embedding Service
export const mockEmbeddingService = {
  embed: jest.fn(),
  embedBatch: jest.fn(),
};

// Mock Response for fetch
export const mockResponse = {
  ok: true,
  json: jest.fn(),
  text: jest.fn(),
};

// Mock fetch globally
global.fetch = jest.fn(() => Promise.resolve(mockResponse)) as jest.Mock;
