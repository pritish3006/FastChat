import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { TavilySearchService, SearchOptions } from '../services/search/tavily';

/**
 * @swagger
 * tags:
 *   name: Agent
 *   description: Advanced agent workflows for chat, search, and voice synthesis
 */

const router = Router();
const searchService = new TavilySearchService();

// Apply optional auth to all search routes
router.use(optionalAuth);

/**
 * @swagger
 * /api/v1/agent/search:
 *   post:
 *     summary: Search the web
 *     description: Perform a search query and return relevant results from the internet
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *               options:
 *                 type: object
 *                 description: Search configuration options
 *                 properties:
 *                   searchDepth:
 *                     type: string
 *                     description: Depth of search (affects comprehensiveness and time)
 *                     enum: [basic, advanced]
 *                     default: basic
 *                   includeImages:
 *                     type: boolean
 *                     description: Whether to include images in results
 *                     default: false
 *                   includeLinks:
 *                     type: boolean
 *                     description: Whether to include source URLs
 *                     default: true
 *                   maxResults:
 *                     type: integer
 *                     description: Maximum number of results to return
 *                     default: 5
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                         description: Title of the search result
 *                       content:
 *                         type: string
 *                         description: Content snippet from the result
 *                       url:
 *                         type: string
 *                         description: Source URL
 *                       score:
 *                         type: number
 *                         description: Relevance score (0-1)
 *                       images:
 *                         type: array
 *                         description: Images from the result (if includeImages=true)
 *                         items:
 *                           type: object
 *                           properties:
 *                             url:
 *                               type: string
 *                             alt:
 *                               type: string
 *       400:
 *         description: Missing query or invalid parameters
 *       500:
 *         description: Search service error
 */
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