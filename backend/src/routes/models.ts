/**
 * models routes
 * 
 * handles listing and information about available llm models.
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { ollamaService } from '../services/llm/ollama';

const router = Router();

// apply optional auth to all models routes
router.use(optionalAuth);

// get all available models
router.get('/', async (req, res, next) => {
  try {
    logger.info('Received request for models list');
    
    logger.info('Attempting to fetch models from ollamaService');
    const models = await ollamaService.listModels();
    logger.info('Successfully fetched models from ollamaService', { 
      modelCount: models.length,
      models: models.map(m => m.name)
    });
    
    const transformedModels = models.map(model => ({
      id: model.name,
      name: model.name,
      provider: 'ollama',
      description: `${model.details.family} (${model.details.parameter_size})`,
      parameters: {
        ...model.details
      }
    }));
    logger.info('Successfully transformed models', { 
      modelCount: transformedModels.length,
      models: transformedModels.map(m => m.id)
    });
    
    res.json({
      success: true,
      models: transformedModels
    });
  } catch (error) {
    logger.error('Error fetching models', { 
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch models'));
  }
});

// get info about a specific model
router.get('/:modelId', async (req, res, next) => {
  try {
    const { modelId } = req.params;
    const models = await ollamaService.listModels();
    const model = models.find(m => m.name === modelId);
    
    if (!model) {
      return next(new ApiError(404, `model ${modelId} not found`));
    }
    
    res.json({
      success: true,
      model: {
        id: model.name,
        name: model.name,
        provider: 'ollama',
        description: `${model.details.family} (${model.details.parameter_size})`,
        parameters: {
          ...model.details
        }
      }
    });
  } catch (error) {
    logger.error('error fetching model', { error, modelId: req.params.modelId });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch model'));
  }
});

export default router; 