import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { TavilySearchService, SearchOptions } from '../services/search/tavily';

const router = Router();
const searchService = new TavilySearchService();

// Apply optional auth to all search routes
router.use(optionalAuth);

// Search endpoint
router.post('/', async (req, res, next) => {
  try {
    const { query, options } = req.body;

    if (!query || typeof query !== 'string') {
      throw new ApiError(400, 'Query is required and must be a string');
    }

    const searchOptions: SearchOptions = {
      searchDepth: options?.searchDepth || 'basic',
      includeImages: options?.includeImages || false,
      includeLinks: options?.includeLinks || true,
      maxResults: options?.maxResults || 5
    };

    const results = await searchService.search(query, searchOptions);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('Search request failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Search request failed'));
  }
});

export default router; 