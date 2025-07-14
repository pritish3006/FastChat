import { Router } from 'express';
import { getSessionTokenUsage, getUserTokenUsage } from '../controllers/tokenController';
import { optionalAuth as authMiddleware } from '../middleware/authMiddleware'; // assuming this exists

/**
 * @swagger
 * tags:
 *   name: Tokens
 *   description: API for tracking and managing token usage
 */

const router = Router();

// All token routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /api/v1/tokens/sessions/{sessionId}:
 *   get:
 *     summary: Get session token usage
 *     description: Retrieve token usage statistics for a specific chat session
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat session ID
 *     responses:
 *       200:
 *         description: Token usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 usage:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total tokens used in session
 *                     prompt:
 *                       type: integer
 *                       description: Tokens used in prompts
 *                     completion:
 *                       type: integer
 *                       description: Tokens used in completions
 *                     models:
 *                       type: object
 *                       description: Token usage broken down by model
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions/:sessionId', getSessionTokenUsage);

/**
 * @swagger
 * /api/v1/tokens/user:
 *   get:
 *     summary: Get user token usage
 *     description: Retrieve aggregate token usage statistics for the current user
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User token usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 usage:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total tokens used by user
 *                     prompt:
 *                       type: integer
 *                       description: Tokens used in prompts
 *                     completion:
 *                       type: integer
 *                       description: Tokens used in completions
 *                     byModel:
 *                       type: object
 *                       description: Usage broken down by model
 *                     byDate:
 *                       type: object
 *                       description: Usage broken down by date
 *       401:
 *         description: Unauthorized
 */
router.get('/user', getUserTokenUsage);

// Check if the user has exceeded rate limits
// TODO: Implement rate limiting
// router.get('/limits', checkRateLimits);

export default router; 