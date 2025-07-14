import { MemoryManager } from '../memory';
import { RedisManager } from '../memory/redis';
import { ContextManager } from '../memory/context';
import { VectorStore } from '../memory/vector';
import { EmbeddingService } from '../memory/embedding';
import { Message, Session, Context } from '../types';
import { v4 as uuidv4 } from 'uuid';
import {
  mockRedisConfig,
  mockRedisClient,
  mockVectorStore,
  mockEmbeddingConfig,
  mockEmbeddingService
} from './setup/test-setup';

// Mock Redis client
jest.mock('../memory/redis', () => ({
  RedisManager: jest.fn().mockImplementation(() => ({
    buildKey: jest.fn((prefix, id) => `${prefix}:${id}`),
    getClient: jest.fn(() => mockRedisClient),
    getSession: jest.fn(),
    saveSession: jest.fn(),
  })),
}));

// Mock Vector Store
jest.mock('../memory/vector', () => ({
  VectorStore: jest.fn().mockImplementation(() => mockVectorStore),
}));

// Mock Embedding Service
jest.mock('../memory/embedding', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => mockEmbeddingService),
}));

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let redisManager: RedisManager;
  let vectorStore: VectorStore;
  let embeddingService: EmbeddingService;
  const mockSessionId = uuidv4();

  beforeEach(() => {
    redisManager = new RedisManager(mockRedisConfig);
    vectorStore = new VectorStore(mockRedisConfig);
    embeddingService = new EmbeddingService(mockEmbeddingConfig);
    memoryManager = new MemoryManager({
      redis: redisManager,
      vectorStore,
      embeddingService,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addContext', () => {
    it('should add context with vector embedding', async () => {
      const mockContext: Context = {
        sessionId: mockSessionId,
        tokenCount: 100,
        messageCount: 1,
        metadata: { type: 'test' }
      };

      const mockEmbedding = new Float32Array([0.1, 0.2, 0.3]);
      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
      mockVectorStore.addDocument.mockResolvedValue(undefined);

      await memoryManager.addContext(mockContext);

      expect(mockEmbeddingService.embed).toHaveBeenCalled();
      expect(mockVectorStore.addDocument).toHaveBeenCalledWith(
        expect.any(String), // Context ID
        mockEmbedding,
        expect.objectContaining({
          sessionId: mockContext.sessionId,
          metadata: mockContext.metadata,
        })
      );
    });

    it('should handle embedding service errors', async () => {
      const mockContext: Context = {
        sessionId: mockSessionId,
        tokenCount: 100,
        messageCount: 1
      };

      mockEmbeddingService.embed.mockRejectedValue(new Error('Embedding failed'));

      await expect(memoryManager.addContext(mockContext)).rejects.toThrow('Embedding failed');
    });
  });

  describe('searchContext', () => {
    it('should search context using vector similarity', async () => {
      const query = 'test query';
      const mockEmbedding = new Float32Array([0.1, 0.2, 0.3]);
      const mockResults = [
        {
          id: uuidv4(),
          score: 0.9,
          metadata: {
            sessionId: mockSessionId,
            tokenCount: 100,
            messageCount: 1
          },
        },
      ];

      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockResults);

      const results = await memoryManager.searchSimilarContext(query, mockSessionId);

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(query);
      expect(mockVectorStore.search).toHaveBeenCalledWith(
        mockEmbedding,
        expect.any(Number),
        expect.objectContaining({
          filter: expect.any(Function),
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.9);
    });

    it('should filter results by session ID', async () => {
      const query = 'test query';
      const mockEmbedding = new Float32Array([0.1, 0.2, 0.3]);
      const mockResults = [
        {
          id: uuidv4(),
          score: 0.9,
          metadata: {
            sessionId: mockSessionId,
            tokenCount: 100,
            messageCount: 1
          },
        },
        {
          id: uuidv4(),
          score: 0.8,
          metadata: {
            sessionId: 'different-session',
            tokenCount: 100,
            messageCount: 1
          },
        },
      ];

      mockEmbeddingService.embed.mockResolvedValue(mockEmbedding);
      mockVectorStore.search.mockResolvedValue(mockResults);

      const results = await memoryManager.searchSimilarContext(query, mockSessionId);

      expect(results).toHaveLength(1);
      expect(results[0].metadata.sessionId).toBe(mockSessionId);
    });
  });

  describe('getSessionMemory', () => {
    it('should return session memory with context', async () => {
      const mockSession: Session = {
        id: mockSessionId,
        contexts: [uuidv4(), uuidv4()],
      };

      const mockContexts = [
        {
          sessionId: mockSessionId,
          tokenCount: 100,
          messageCount: 1,
        },
        {
          sessionId: mockSessionId,
          tokenCount: 200,
          messageCount: 2,
        },
      ];

      jest.spyOn(redisManager, 'getSession').mockResolvedValue(mockSession);
      jest.spyOn(memoryManager as any, 'getContext')
        .mockImplementation(async (contextId) => mockContexts[0]);

      const result = await memoryManager.getSessionMemory(mockSessionId);

      expect(result.contexts).toHaveLength(2);
      expect(result.contexts[0].tokenCount).toBe(100);
      expect(result.contexts[1].tokenCount).toBe(100);
    });

    it('should return empty memory when session not found', async () => {
      jest.spyOn(redisManager, 'getSession').mockResolvedValue(null);

      const result = await memoryManager.getSessionMemory(mockSessionId);

      expect(result.contexts).toHaveLength(0);
    });
  });
});
