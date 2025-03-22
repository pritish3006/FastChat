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
import express from 'express';
import { z } from 'zod';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Chat API endpoints for message processing, history, and session management
 */

// apply optional auth to all chat routes
router.use(optionalAuth);

// apply stricter rate limiting to chat routes
router.use(chatLimiter);

/**
 * @swagger
 * /api/v1/chat/message:
 *   post:
 *     summary: Send a message to the chat
 *     description: Send a message and get a response from the AI
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The message content
 *               conversationId:
 *                 type: string
 *                 description: Optional conversation ID for context
 *               systemPrompt:
 *                 type: string
 *                 description: Optional system prompt to guide the AI
 *               temperature:
 *                 type: number
 *                 description: Temperature for response generation (0-2)
 *               maxTokens:
 *                 type: integer
 *                 description: Maximum tokens in response
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/message', sendMessage);

/**
 * @swagger
 * /api/v1/chat/stream:
 *   get:
 *     summary: Stream chat responses
 *     description: Server-Sent Events endpoint for streaming chat responses
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: content
 *         required: true
 *         schema:
 *           type: string
 *         description: The message content
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         description: Optional conversation ID
 *       - in: query
 *         name: systemPrompt
 *         schema:
 *           type: string
 *         description: Optional system prompt
 *       - in: query
 *         name: temperature
 *         schema:
 *           type: number
 *         description: Temperature for response generation
 *       - in: query
 *         name: maxTokens
 *         schema:
 *           type: integer
 *         description: Maximum tokens in response
 *     responses:
 *       200:
 *         description: SSE stream of chat response
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [metadata, content, done, error]
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
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
        openaiApiKey: config.llm.openaiApiKey,
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

/**
 * @swagger
 * /api/v1/chat/models:
 *   get:
 *     summary: Get available chat models
 *     description: Retrieve list of available AI models for chat
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: List of available models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       provider:
 *                         type: string
 *                       capabilities:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/models', getModels);

/**
 * @swagger
 * /api/v1/chat/stop:
 *   post:
 *     summary: Stop message generation
 *     description: Stop an in-progress message generation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Generation stopped successfully
 *       400:
 *         description: No active generation to stop
 *       401:
 *         description: Unauthorized
 */
router.post('/stop', stopGeneration);

/**
 * @swagger
 * /api/v1/chat/history/{sessionId}:
 *   get:
 *     summary: Get chat history for a session
 *     description: Retrieve chat history for a specific session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
 *     responses:
 *       200:
 *         description: Chat history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 session:
 *                   type: object
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not your session
 *       404:
 *         description: Session not found
 */
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

// Global in-memory store for active streams
const activeStreams = new Map();

/**
 * @swagger
 * /api/v1/chat/sessions:
 *   post:
 *     summary: Create a new chat session
 *     description: Create a new chat session with specified model
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *             properties:
 *               modelId:
 *                 type: string
 *                 description: The AI model ID to use
 *               title:
 *                 type: string
 *                 description: Optional session title
 *     responses:
 *       201:
 *         description: Session created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/sessions', optionalAuth, async (req, res, next) => {
  try {
    const { modelId, title } = req.body;
    
    if (!modelId) {
      throw new ApiError(400, 'modelId is required');
    }
    
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      title: title || 'Untitled',
      modelId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      messages: [],
      userId: req.user?.id || null
    };
    
    // Store session in memory for now
    global.sessions = global.sessions || new Map();
    global.sessions.set(sessionId, session);
    
    res.status(201).json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/sessions:
 *   get:
 *     summary: Get all chat sessions
 *     description: Retrieve all chat sessions for the current user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chat sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get('/sessions', optionalAuth, async (req, res, next) => {
  try {
    const sessions = Array.from(global.sessions?.values() || []);
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/sessions/{sessionId}:
 *   get:
 *     summary: Get a specific chat session
 *     description: Retrieve details of a specific chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
 *     responses:
 *       200:
 *         description: Session details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.get('/sessions/:sessionId', optionalAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    if (!global.sessions?.has(sessionId)) {
      throw new ApiError(404, 'session not found');
    }
    
    const session = global.sessions.get(sessionId);
    res.json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/sessions/{sessionId}:
 *   delete:
 *     summary: Delete a chat session
 *     description: Delete a specific chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
 *     responses:
 *       204:
 *         description: Session deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.delete('/sessions/:sessionId', optionalAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    if (!global.sessions?.has(sessionId)) {
      throw new ApiError(404, 'session not found');
    }
    
    global.sessions.delete(sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/sessions/{sessionId}/clear:
 *   post:
 *     summary: Clear chat session messages
 *     description: Clear all messages from a chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
 *     responses:
 *       200:
 *         description: Session cleared successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.post('/sessions/:sessionId/clear', optionalAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    const session = global.sessions?.get(sessionId);
    if (!session) {
      throw new ApiError(404, 'session not found');
    }
    
    session.messages = [];
    session.messageCount = 0;
    session.updatedAt = new Date().toISOString();
    
    global.sessions.set(sessionId, session);
    res.json({
      success: true,
      session
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/chat/search/{sessionId}:
 *   post:
 *     summary: Search chat history
 *     description: Perform semantic search in chat session history
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
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
 *                 description: Search query
 *               limit:
 *                 type: integer
 *                 description: Maximum number of results
 *               threshold:
 *                 type: number
 *                 description: Similarity threshold
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not your session
 *       404:
 *         description: Session not found
 */
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
    const llmService = new LLMService({   // ????
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

/**
 * @swagger
 * /api/v1/chat/sessions/{sessionId}/model:
 *   post:
 *     summary: Set session model
 *     description: Change the AI model for a chat session
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The chat session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *             properties:
 *               modelId:
 *                 type: string
 *                 description: New AI model ID
 *     responses:
 *       200:
 *         description: Model updated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.post('/sessions/:sessionId/model', optionalAuth, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { modelId } = req.body;

    if (!modelId) {
      throw new ApiError(400, 'modelId is required');
    }

    // Check if session exists in memory first
    if (!global.sessions?.has(sessionId)) {
      throw new ApiError(404, 'chat session not found');
    }

    // Get and update the session
    const session = global.sessions.get(sessionId);
    session.modelId = modelId;
    session.updatedAt = new Date().toISOString();
    
    // Update in memory
    global.sessions.set(sessionId, session);

    res.json({
      success: true,
      session
    });
  } catch (error) {
    logger.error('Error setting session model:', error);
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to set session model.'));
  }
});

/**
 * @swagger
 * /api/v1/chat:
 *   post:
 *     summary: Send a message to the chat
 *     description: Send a message to the chat and get a response from the AI
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to send to the chat
 *               model:
 *                 type: string
 *                 description: The model to use for the response
 *                 enum: [gpt-4, gpt-3.5-turbo, claude-3-opus, claude-3-sonnet]
 *               temperature:
 *                 type: number
 *                 description: The temperature for response generation
 *                 minimum: 0
 *                 maximum: 2
 *                 default: 0.7
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   description: The AI's response
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: number
 *                     completion_tokens:
 *                       type: number
 *                     total_tokens:
 *                       type: number
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', async (req, res) => {
  // ... existing route handler code ...
});

/**
 * @swagger
 * /api/v1/chat/history:
 *   get:
 *     summary: Get chat history
 *     description: Retrieve the chat history for the current user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of messages to return
 *         default: 50
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   message:
 *                     type: string
 *                   response:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/history', async (req, res) => {
  // ... existing route handler code ...
});

export default router;