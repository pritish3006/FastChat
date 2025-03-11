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

const router = Router();

// apply optional auth to all chat routes
router.use(optionalAuth);

// apply stricter rate limiting to chat routes
router.use(chatLimiter);

// route to send a message and get a streaming response
router.post('/message', sendMessage);

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

export default router; 