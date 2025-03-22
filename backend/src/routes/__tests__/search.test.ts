import request from 'supertest';
import express from 'express';
import { TavilySearchService } from '../../services/search/tavily';
import searchRouter from '../search';

// Mock TavilySearchService
jest.mock('../../services/search/tavily');

describe('Search Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/search', searchRouter);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/v1/search', () => {
    it('should return search results', async () => {
      const mockResults = {
        results: [
          {
            title: 'Test Result',
            url: 'https://test.com',
            content: 'Test content',
            score: 0.95
          }
        ],
        query: 'test query'
      };

      (TavilySearchService.prototype.search as jest.Mock).mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .post('/api/v1/search')
        .send({
          query: 'test query',
          options: {
            searchDepth: 'basic',
            maxResults: 5
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        results: mockResults
      });
      expect(TavilySearchService.prototype.search).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          searchDepth: 'basic',
          maxResults: 5
        })
      );
    });

    it('should handle missing query', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({
          options: {
            searchDepth: 'basic'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle search service errors', async () => {
      (TavilySearchService.prototype.search as jest.Mock).mockRejectedValueOnce(
        new Error('Search failed')
      );

      const response = await request(app)
        .post('/api/v1/search')
        .send({
          query: 'test query'
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should use default options when none provided', async () => {
      const mockResults = { results: [], query: 'test' };
      (TavilySearchService.prototype.search as jest.Mock).mockResolvedValueOnce(mockResults);

      await request(app)
        .post('/api/v1/search')
        .send({
          query: 'test query'
        });

      expect(TavilySearchService.prototype.search).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          searchDepth: 'basic',
          includeImages: false,
          includeLinks: true,
          maxResults: 5
        })
      );
    });
  });
}); 