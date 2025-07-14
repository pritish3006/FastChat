import { jest, describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import { VectorStore, VectorStoreConfig } from '../vector';
import { v4 as uuidv4 } from 'uuid';

describe('VectorStore', () => {
  let vectorStore: VectorStore;
  const testConfig: VectorStoreConfig = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || '', // Using service key for tests
    tableName: 'test_embeddings',
    embeddingDimension: 4, // Small dimension for testing
    options: {
      serviceRole: true
    }
  };

  beforeAll(async () => {
    vectorStore = new VectorStore(testConfig);
    await vectorStore.initialize();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await vectorStore['supabase']
      .from(testConfig.tableName!)
      .delete()
      .neq('id', 'dummy');
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid config', async () => {
      const store = new VectorStore(testConfig);
      await expect(store.initialize()).resolves.not.toThrow();
    });

    it('should throw error with invalid config', () => {
      expect(() => new VectorStore({
        supabaseUrl: '',
        supabaseKey: ''
      })).toThrow();
    });
  });

  describe('Embedding Operations', () => {
    it('should store and retrieve embeddings', async () => {
      const messageId = uuidv4();
      const content = 'Test message';
      const embedding = [0.1, 0.2, 0.3, 0.4];
      const metadata = { source: 'test' };

      await vectorStore.storeEmbedding(messageId, content, embedding, metadata);

      const results = await vectorStore.searchSimilar(embedding, { threshold: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(messageId);
      expect(results[0].content).toBe(content);
      expect(results[0].metadata.source).toBe(metadata.source);
    });

    it('should update existing embeddings', async () => {
      const messageId = uuidv4();
      const initialContent = 'Initial content';
      const updatedContent = 'Updated content';
      const initialEmbedding = [0.1, 0.2, 0.3, 0.4];
      const updatedEmbedding = [0.5, 0.6, 0.7, 0.8];

      await vectorStore.storeEmbedding(messageId, initialContent, initialEmbedding);
      await vectorStore.updateEmbedding(messageId, updatedContent, updatedEmbedding);

      const results = await vectorStore.searchSimilar(updatedEmbedding, { threshold: 0.5 });
      expect(results[0].content).toBe(updatedContent);
    });

    it('should delete embeddings', async () => {
      const messageId = uuidv4();
      const embedding = [0.1, 0.2, 0.3, 0.4];

      await vectorStore.storeEmbedding(messageId, 'Test', embedding);
      await vectorStore.deleteEmbedding(messageId);

      const results = await vectorStore.searchSimilar(embedding, { threshold: 0.5 });
      expect(results).toHaveLength(0);
    });
  });

  describe('Similarity Search', () => {
    it('should find similar messages with threshold', async () => {
      const embeddings = [
        { id: uuidv4(), content: 'First message', embedding: [0.1, 0.2, 0.3, 0.4] },
        { id: uuidv4(), content: 'Second message', embedding: [0.15, 0.25, 0.35, 0.45] },
        { id: uuidv4(), content: 'Different message', embedding: [0.9, 0.8, 0.7, 0.6] }
      ];

      await vectorStore.importMessageEmbeddings(embeddings);

      const results = await vectorStore.searchSimilar([0.1, 0.2, 0.3, 0.4], {
        threshold: 0.8,
        limit: 2
      });

      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('First message');
      expect(results[1].content).toBe('Second message');
    });

    it('should apply metadata filters in search', async () => {
      const embeddings = [
        {
          id: uuidv4(),
          content: 'Test A',
          embedding: [0.1, 0.2, 0.3, 0.4],
          metadata: { category: 'A' }
        },
        {
          id: uuidv4(),
          content: 'Test B',
          embedding: [0.15, 0.25, 0.35, 0.45],
          metadata: { category: 'B' }
        }
      ];

      await vectorStore.importMessageEmbeddings(embeddings);

      const results = await vectorStore.searchSimilar([0.1, 0.2, 0.3, 0.4], {
        threshold: 0.5,
        filter: { category: 'A' }
      });

      expect(results).toHaveLength(1);
      expect(results[0].metadata.category).toBe('A');
    });
  });

  describe('Batch Operations', () => {
    it('should import message embeddings in batch', async () => {
      const messages = Array.from({ length: 150 }, (_, i) => ({
        id: uuidv4(),
        content: `Message ${i}`,
        embedding: [0.1, 0.2, 0.3, 0.4],
        metadata: { index: i }
      }));

      await vectorStore.importMessageEmbeddings(messages);
      const count = await vectorStore.getEmbeddingCount();
      expect(count).toBe(150);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid embedding dimensions', async () => {
      const messageId = uuidv4();
      const invalidEmbedding = [0.1, 0.2]; // Wrong dimension

      await expect(
        vectorStore.storeEmbedding(messageId, 'Test', invalidEmbedding)
      ).rejects.toThrow();
    });

    it('should handle duplicate message IDs gracefully', async () => {
      const messageId = uuidv4();
      const embedding = [0.1, 0.2, 0.3, 0.4];

      await vectorStore.storeEmbedding(messageId, 'First', embedding);
      await expect(
        vectorStore.storeEmbedding(messageId, 'Second', embedding)
      ).rejects.toThrow();
    });
  });

  describe('LangChain Integration', () => {
    it('should create LangChain retriever', () => {
      const mockEmbeddings = {
        embedQuery: jest.fn(),
        embedDocuments: jest.fn()
      };

      const retriever = vectorStore.asLangChainRetriever();
      expect(retriever).toBeDefined();
      expect(typeof retriever.getRelevantDocuments).toBe('function');
    });
  });
}); 