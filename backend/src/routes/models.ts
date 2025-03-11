/**
 * models routes
 * 
 * handles listing and information about available llm models.
 */

import { Router } from 'express';
import { llmService } from '../services/llm';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// apply optional auth to all models routes
router.use(optionalAuth);

// get all available models
router.get('/', async (req, res, next) => {
  try {
    const models = await llmService.listModels();
    
    res.json({
      success: true,
      models
    });
  } catch (error) {
    logger.error('error fetching models', { error });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch models'));
  }
});

// get info about a specific model
router.get('/:modelId', async (req, res, next) => {
  try {
    const { modelId } = req.params;
    const model = await llmService.getModel(modelId);
    
    if (!model) {
      return next(new ApiError(404, `model ${modelId} not found`));
    }
    
    res.json({
      success: true,
      model
    });
  } catch (error) {
    logger.error('error fetching model', { error, modelId: req.params.modelId });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch model'));
  }
});

export default router; 