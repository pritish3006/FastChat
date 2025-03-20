/**
 * models routes
 * 
 * handles listing and information about available llm models.
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { config } from '../config';
import { BaseModelProperties } from '../services/llm/types';

const router = Router();

// apply optional auth to all models routes
router.use(optionalAuth);

// Hardcoded model definitions
const AVAILABLE_MODELS = [
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    description: 'Fast and efficient model for most general-purpose tasks',
    parameters: {
      contextLength: 4096,
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      pricing: {
        inputTokens: 0.5,   // $0.5/M tokens
        outputTokens: 1.5   // $1.5/M tokens
      }
    }
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'Cost-efficient model optimized for STEM reasoning tasks, particularly excelling in science, mathematics, and coding',
    parameters: {
      contextLength: 200000,
      reasoningEffort: ['low', 'medium', 'high'],
      supportsFunctionCalling: true,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      pricing: {
        inputTokens: 1.1,  // $1.1/M tokens
        outputTokens: 4.4  // $4.4/M tokens
      },
      benchmarks: {
        aime: '87.3%',           // AIME competition math questions
        gpqaDiamond: '79.7%',    // PhD-level science questions
        codeforces: '2130 Elo',  // Competitive programming rating
        sweBench: '49.3%'        // Software engineering tasks
      }
    }
  }
];

// get all available models
router.get('/', async (req, res, next) => {
  try {
    logger.info('Received request for models list');
    
    res.json({
      success: true,
      models: AVAILABLE_MODELS
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
router.get('/:provider/:modelId', async (req, res, next) => {
  try {
    const { provider, modelId } = req.params;

    if (!provider || !modelId) {
      return next(new ApiError(400, 'Invalid request format. Expected: /models/provider/modelId'));
    }

    // Find the requested model
    const model = AVAILABLE_MODELS.find(m => 
      m.provider.toLowerCase() === provider.toLowerCase() && 
      (m.id.toLowerCase() === modelId.toLowerCase() || m.name.toLowerCase() === modelId.toLowerCase())
    );

    if (!model) {
      return next(new ApiError(404, `Model ${modelId} not found for provider ${provider}`));
    }

    res.json({
      success: true,
      model
    });
  } catch (error) {
    logger.error('Error fetching model', { error, modelId: req.params.modelId });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch model'));
  }
});

export default router; 