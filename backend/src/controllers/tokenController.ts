import { Request, Response, NextFunction } from 'express';
import { LLMService } from '../services/llm';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// Reference to the LLM service instance (this will be set from our server initialization)
let llmServiceInstance: LLMService | null = null;

export const setLLMServiceInstance = (instance: LLMService): void => {
  llmServiceInstance = instance;
};

/**
 * Get token usage for a session
 */
export const getSessionTokenUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!llmServiceInstance) {
      throw new ApiError(500, 'LLM service not initialized');
    }
    
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }
    
    const { sessionId } = req.params;
    
    if (!sessionId) {
      throw new ApiError(400, 'Session ID is required');
    }
    
    // Get token usage for the session
    const tokenUsage = await llmServiceInstance.getSessionTokenUsage(sessionId);
    
    res.json({
      success: true,
      sessionId,
      tokenUsage
    });
  } catch (error) {
    logger.error('Error fetching session token usage', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id,
      sessionId: req.params.sessionId
    });
    
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to fetch token usage'));
  }
};

/**
 * Get token usage for the current user
 */
export const getUserTokenUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!llmServiceInstance) {
      throw new ApiError(500, 'LLM service not initialized');
    }
    
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }
    
    const userId = req.user.id;
    
    // Get token usage for the user
    const tokenUsage = await llmServiceInstance.getUserTokenUsage(userId);
    
    res.json({
      success: true,
      userId,
      tokenUsage
    });
  } catch (error) {
    logger.error('Error fetching user token usage', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id
    });
    
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to fetch token usage'));
  }
};

/**
 * Check if the user has exceeded rate limits
 */
export const checkRateLimits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!llmServiceInstance) {
      throw new ApiError(500, 'LLM service not initialized');
    }
    
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }
    
    const userId = req.user.id;
    
    // Check rate limits for the user
    const rateLimitInfo = await llmServiceInstance.checkRateLimits(userId);
    
    res.json({
      success: true,
      userId,
      ...rateLimitInfo
    });
  } catch (error) {
    logger.error('Error checking rate limits', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id
    });
    
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to check rate limits'));
  }
}; 