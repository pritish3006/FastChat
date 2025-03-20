import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { WorkflowFactory } from '../services/agents/graph/workflow-factory';
import { config } from '../config';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const router = Router();

// Debug logging
logger.info('Initializing agent router');

// Apply optional auth to all agent routes
router.use(optionalAuth);

// Debug logging
logger.info('Registering agent query endpoint');

// Process query through agent workflow
router.post('/query', async (req, res, next) => {
  logger.info('Received agent query request', { 
    message: req.body.message,
    hasHistory: !!req.body.history?.length,
    flags: req.body.flags
  });
  
  try {
    const { message, history = [], flags = {} } = req.body;

    if (!message || typeof message !== 'string') {
      throw new ApiError(400, 'Message is required and must be a string');
    }

    // Validate flags if present
    if (flags.needsSummary && flags.summaryMode) {
      if (!['search', 'chat', 'voice'].includes(flags.summaryMode)) {
        throw new ApiError(400, 'Invalid summary mode. Must be one of: search, chat, voice');
      }
    }

    // Create initial context
    const context = {
      message,
      history: history as ChatCompletionMessageParam[],
      intermediateSteps: [],
      toolResults: {},
      flags,
      config: {
        apiKey: config.llm.apiKey!,
        searchApiKey: config.search.tavilyApiKey!,
        voiceApiKey: config.voice.ttsApiKey!
      }
    };

    // Create and execute workflow
    const workflow = WorkflowFactory.createChatWorkflow(context, {
      onToken: (token) => {
        logger.debug('Token received', { token });
      },
      onToolStart: (tool) => {
        logger.info('Tool execution started', { tool });
      },
      onToolEnd: (tool, result) => {
        logger.info('Tool execution completed', { tool });
      },
      onComplete: (result) => {
        logger.info('Workflow completed', { 
          hasResponse: !!result.context.toolResults.response,
          hasSummary: !!result.context.toolResults.summary,
          hasSearch: !!result.context.toolResults.search?.length
        });
      }
    });

    logger.info('Starting workflow execution', {
      needsSearch: flags.needsSearch,
      needsSummary: flags.needsSummary,
      summaryMode: flags.summaryMode
    });

    // Start with response node by default, or search if needed
    const startNode = flags.needsSearch ? 'search' : flags.needsSummary ? 'summary' : 'response';
    const result = await workflow.execute(startNode);

    logger.info('Workflow execution completed', {
      steps: result.context.intermediateSteps.length,
      hasResponse: !!result.context.toolResults.response,
      hasSummary: !!result.context.toolResults.summary,
      hasSearch: !!result.context.toolResults.search?.length
    });

    res.json({
      success: true,
      result: {
        response: result.context.toolResults.response,
        summary: result.context.toolResults.summary,
        search: result.context.toolResults.search,
        steps: result.context.intermediateSteps
      }
    });
  } catch (error) {
    logger.error('Agent query failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Agent query failed'));
  }
});

logger.info('Agent router initialization complete');

export default router; 