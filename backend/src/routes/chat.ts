// @ts-nocheck
/**
 * chat routes
 * 
 * handles chat message processing, history, and session management.
 */

import { Router } from 'express';
import { sendMessage, getModels, stopGeneration } from '../controllers/chatController';
import { optionalAuth } from '../middleware/authMiddleware';
import { chatLimiter } from '../middleware/rateLimiter';
import { chatSessions, messages as dbMessages } from '../services/database';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { LLMService } from '../services/llm';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// apply optional auth to all chat routes
router.use(optionalAuth);

// apply stricter rate limiting to chat routes
router.use(chatLimiter);

// route to send a message and get a streaming response
router.post('/message', sendMessage);

// route for SSE streaming
router.get('/stream', async (req, res, next) => {
  const requestId = uuidv4();
  
  try {
    // Get query parameters
    const content = req.query.content as string;
    const conversationId = req.query.conversationId as string;
    const systemPrompt = req.query.systemPrompt as string;
    const temperature = parseFloat(req.query.temperature as string) || 0.7;
    const maxTokens = parseInt(req.query.maxTokens as string) || 2000;
    
    if (!content) {
      return next(new ApiError(400, 'content is required'));
    }

    // Get or create a session id
    const userId = req.user?.id || 'anonymous';
    let actualSessionId = conversationId;
    
    if (!actualSessionId && req.user) {
      try {
        // create a new session if user is authenticated
        const newSession = await chatSessions.create({
          userId: req.user.id,
          title: content.substring(0, 50),
          modelId: 'gpt-3.5-turbo' // Default to OpenAI for SSE
        });
        actualSessionId = newSession.id;
      } catch (error) {
        logger.warn('Failed to create chat session, using temporary session', {
          error: error instanceof Error ? error.message : String(error),
          userId
        });
        actualSessionId = `temp-${uuidv4()}`;
      }
    }
    
    // set response headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    
    // Important: disable Node.js compression which can cause buffering issues
    if (res.flush) {
      res.flush();
    }
    
    // Debug: log that we're starting the stream
    logger.debug('Starting SSE stream', { requestId });
    
    // Initialize LLM service with Redis memory
    const llmService = new LLMService({
      model: {
        provider: 'openai',
        modelId: 'gpt-3.5-turbo',
        apiKey: config.llm.openaiApiKey,
        temperature,
        maxTokens
      },
      memory: {
        redis: {
          enabled: true,
          url: config.redis.url,
          prefix: config.redis.prefix,
          sessionTTL: config.redis.sessionTTL
        }
      }
    });

    // Initialize the service
    await llmService.initialize();
    
    // start stream with metadata
    res.write(`event: metadata\ndata: ${JSON.stringify({
      type: 'metadata',
      request_id: requestId,
      model: 'gpt-3.5-turbo',
      session_id: actualSessionId
    })}\n\n`);
    
    // Ensure buffer is flushed immediately
    if (res.flush) {
      res.flush();
    }
    
    // Handle client disconnection
    req.on('close', () => {
      logger.info('Client closed connection', { requestId });
      if (activeStreams.has(requestId)) {
        const stream = activeStreams.get(requestId);
        if (stream && typeof stream.abort === 'function') {
          stream.abort();
          logger.info('Stream aborted due to client disconnect', { requestId });
        }
        activeStreams.delete(requestId);
      }
    });
    
    // Set up streaming callbacks
    const callbacks = {
      onToken: (token: string) => {
        res.write(`event: content\ndata: ${JSON.stringify({
          type: 'content',
          content: token
        })}\n\n`);
        if (res.flush) res.flush();
      },
      onComplete: () => {
        res.write(`event: done\ndata: ${JSON.stringify({
          type: 'done',
          request_id: requestId
        })}\n\n`);
        if (res.flush) res.flush();
        res.end();
      },
      onError: (error: Error) => {
        logger.error('Error in stream', { error: error.message, requestId });
        res.write(`event: error\ndata: ${JSON.stringify({
          type: 'error',
          error: error.message
        })}\n\n`);
        if (res.flush) res.flush();
        res.end();
      }
    };

    // Send the message
    try {
      const messages = [{
        role: 'user',
        content
      }];

      // Create a generator for streaming responses
      const streamGenerator = llmService.model.streamChatCompletion(
        messages,
        {
          temperature,
          maxTokens
        },
        {
          onToken: (token: string) => {
            res.write(`event: content\ndata: ${JSON.stringify({
              type: 'content',
              content: token
            })}\n\n`);
            if (res.flush) res.flush();
          },
          onComplete: () => {
            res.write(`event: done\ndata: ${JSON.stringify({
              type: 'done',
              request_id: requestId
            })}\n\n`);
            if (res.flush) res.flush();
            res.end();
          },
          onError: (error: Error) => {
            logger.error('Error in stream', { error: error.message, requestId });
            res.write(`event: error\ndata: ${JSON.stringify({
              type: 'error',
              error: error.message
            })}\n\n`);
            if (res.flush) res.flush();
            res.end();
          }
        }
      );

      // Process the stream
      for await (const chunk of streamGenerator) {
        if (chunk.type === 'error') {
          throw chunk.error;
        }
      }
    } catch (error) {
      logger.error('Failed to generate response', {
        error: error instanceof Error ? error.message : String(error),
        requestId
      });
      next(new ApiError(500, 'Failed to generate response'));
    }
  } catch (error) {
    next(error);
  }
});

// route to get available models
router.get('/models', getModels);

// route to stop an in-progress generation
router.post('/stop', stopGeneration);

// get chat history for a session
router.get('/history/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    // only allow authenticated users to access history
    if (!req.user) {
      return next(new ApiError(401, 'authentication required to access chat history'));
    }
    
    // get session to verify ownership
    const session = await chatSessions.getById(sessionId);
    
    if (!session) {
      return next(new ApiError(404, 'chat session not found'));
    }
    
    // verify user owns this session
    if (session.userId !== req.user.id) {
      return next(new ApiError(403, 'you do not have permission to access this chat session'));
    }
    
    // get messages for this session
    const messages = await dbMessages.getBySessionId(sessionId);
    
    res.json({
      success: true,
      session,
      messages
    });
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error('error fetching chat history'), { sessionId: req.params.sessionId });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch chat history'));
  }
});

// get all chat sessions for authenticated user
router.get('/sessions', async (req, res, next) => {
  try {
    // only allow authenticated users to access sessions
    if (!req.user) {
      return next(new ApiError(401, 'authentication required to access chat sessions'));
    }
    
    // get all sessions for this user
    const sessions = await chatSessions.getByUserId(req.user.id);
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error('error fetching user sessions'), { userId: req.user?.id });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch chat sessions'));
  }
});

// create a new chat session
router.post('/sessions', async (req, res, next) => {
  try {
    // only allow authenticated users to create sessions
    if (!req.user) {
      return next(new ApiError(401, 'authentication required to create chat sessions'));
    }
    
    const { title, modelId } = req.body;
    
    if (!title) {
      return next(new ApiError(400, 'title is required'));
    }
    
    // create a new session
    const session = await chatSessions.create({
      userId: req.user.id,
      title,
      modelId: modelId || 'llama3'
    });
    
    res.json({
      success: true,
      session
    });
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error('error creating chat session'), { userId: req.user?.id });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to create chat session'));
  }
});

// delete a chat session
router.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    // only allow authenticated users to delete sessions
    if (!req.user) {
      return next(new ApiError(401, 'authentication required to delete chat sessions'));
    }
    
    // get session to verify ownership
    const session = await chatSessions.getById(sessionId);
    
    if (!session) {
      return next(new ApiError(404, 'chat session not found'));
    }
    
    // verify user owns this session
    if (session.userId !== req.user.id) {
      return next(new ApiError(403, 'you do not have permission to delete this chat session'));
    }
    
    // delete the session
    await chatSessions.delete(sessionId);
    
    res.json({
      success: true,
      message: 'chat session deleted successfully'
    });
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error('error deleting chat session'), { sessionId: req.params.sessionId });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to delete chat session'));
  }
});

// New route: semantic search in session history
router.post('/search/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { query, limit = 5, threshold = 0.7 } = req.body;
    
    if (!query || typeof query !== 'string') {
      return next(new ApiError(400, 'search query is required'));
    }
    
    // only allow authenticated users to search in history
    if (!req.user) {
      return next(new ApiError(401, 'authentication required to search chat history'));
    }
    
    // get session to verify ownership
    const session = await chatSessions.getById(sessionId);
    
    if (!session) {
      return next(new ApiError(404, 'chat session not found'));
    }
    
    // verify user owns this session
    if (session.userId !== req.user.id) {
      return next(new ApiError(403, 'you do not have permission to access this chat session'));
    }
    
    // Create an LLM service instance
    const llmService = new LLMService({
      model: {
        provider: 'ollama',
        modelId: session.modelId || config.llm.defaultModel,
        baseUrl: config.llm.ollamaEndpoint
      },
      memory: {
        redisUrl: config.redis.url,
        vectorStore: {
          type: 'supabase',
          supabaseUrl: config.database.supabaseUrl,
          supabaseKey: config.database.supabaseKey,
          embeddingModel: 'llama3'
        }
      }
    });
    
    // Initialize the service
    await llmService.initialize();
    
    try {
      // Perform semantic search
      const similarMessages = await llmService.findSimilarMessages(
        sessionId,
        query,
        {
          limit: Number(limit) || 5,
          threshold: Number(threshold) || 0.7
        }
      );
      
      res.json({
        success: true,
        results: similarMessages.map(msg => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          timestamp: msg.timestamp,
          similarity: msg.metadata?.similarity || null
        }))
      });
    } finally {
      // Clean up resources
      await llmService.shutdown();
    }
  } catch (error) {
    logger.error('error searching chat history', { 
      sessionId: req.params.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to search chat history'));
  }
});

// Set session model
router.post('/sessions/:sessionId/model', async (req, res, next) => {
  const { sessionId } = req.params;
  const { modelId } = req.body;

  try {
    // get session to verify ownership
    const session = await chatSessions.getById(sessionId);
    
    if (!session) {
      return next(new ApiError(404, 'chat session not found'));
    }

    // update the session model
    await chatSessions.update(sessionId, { modelId });

    return res.status(200).json({ success: true, message: 'Session model updated.' });
  } catch (error) {
    logger.error('Error setting session model:', error);
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to set session model.'));
  }
});

export default router;