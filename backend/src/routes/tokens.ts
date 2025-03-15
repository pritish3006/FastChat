import { Router } from 'express';
import { getSessionTokenUsage, getUserTokenUsage } from '../controllers/tokenController';
import { optionalAuth as authMiddleware } from '../middleware/authMiddleware'; // assuming this exists

const router = Router();

// All token routes require authentication
router.use(authMiddleware);

// Get token usage for a specific session
router.get('/sessions/:sessionId', getSessionTokenUsage);

// Get token usage for the current user
router.get('/user', getUserTokenUsage);

// Check if the user has exceeded rate limits
// TODO: Implement rate limiting
// router.get('/limits', checkRateLimits);

export default router; 