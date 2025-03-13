// @ts-nocheck
/**
 * chat controller
 * 
 * handles chat message processing and routing to llm services.
 * implements streaming, history, and conversation management.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { llmService, ChatMessage } from '../services/llm';
import { chatSessions, messages } from '../services/database';
import { ApiError } from '../middleware/errorHandler';
import { io } from '../index';
import logger from '../utils/logger';

// active stream controllers by request id
const activeStreams = new Map<string, any>();

// in-memory fallback for chat history when session can't be loaded
const fallbackSessionHistory = new Map<string, ChatMessage[]>();

// validate message request schema
const messageSchema = z.object({
  message: z.string().min(1).max(5000),
  model: z.string().min(1).optional(),
  session_id: z.string().optional(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string()
    })
  ).optional(),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().optional(),
    top_p: z.number().min(0).max(1).optional(),
    stop: z.array(z.string()).optional()
  }).optional()
});

/**
 * sends a message to the llm and streams the response
 */
export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestId = uuidv4();
    
    // log request start
    logger.info('Chat streaming request received', {
      requestId,
      contentLength: req.body?.message?.length || 0,
      model: req.body?.model || 'default',
      userAgent: req.headers['user-agent']
    });
    
    // validate request body
    const validatedData = messageSchema.parse(req.body);
    const { message, model, session_id: sessionId, history, options } = validatedData;
    
    // get or create a session id
    const userId = req.user?.id || 'anonymous';
    let actualSessionId = sessionId;
    
    if (!actualSessionId && req.user) {
      try {
        // create a new session if user is authenticated
        const newSession = await chatSessions.create({
          userId: req.user.id,
          title: message.substring(0, 50),
          modelId: model || 'llama3'
        });
        actualSessionId = newSession.id;
      } catch (error) {
        // If we can't create a session, generate a temporary one
        // This allows the chat to work even if database is down
        logger.warn('Failed to create chat session, using temporary session', {
          error: error instanceof Error ? error.message : String(error),
          userId
        });
        actualSessionId = `temp-${uuidv4()}`;
      }
    }
    
    // prepare messages array for the LLM
    const allMessages: ChatMessage[] = [];
    
    // use provided history or fetch from database
    if (history) {
      allMessages.push(...history);
    } else if (actualSessionId) {
      try {
        // fetch history from database if session exists
        const sessionMessages = await messages.getBySessionId(actualSessionId);
        
        if (sessionMessages.length > 0) {
          for (const msg of sessionMessages) {
            allMessages.push({
              role: msg.role,
              content: msg.content
            });
          }
          
          // Cache the history for fallback if needed
          fallbackSessionHistory.set(actualSessionId, [...sessionMessages]);
        } else if (fallbackSessionHistory.has(actualSessionId)) {
          // Use cached history if database returned empty but we have a cached version
          const cachedMessages = fallbackSessionHistory.get(actualSessionId) || [];
          allMessages.push(...cachedMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })));
          
          logger.info('Using cached message history', { 
            sessionId: actualSessionId,
            messageCount: cachedMessages.length
          });
        }
      } catch (error) {
        // If we can't fetch messages, try using the in-memory fallback
        logger.warn('Failed to fetch session messages, using fallback if available', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: actualSessionId
        });
        
        if (fallbackSessionHistory.has(actualSessionId)) {
          const cachedMessages = fallbackSessionHistory.get(actualSessionId) || [];
          allMessages.push(...cachedMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })));
          
          logger.info('Using cached message history after DB error', { 
            sessionId: actualSessionId,
            messageCount: cachedMessages.length
          });
        }
      }
    }
    
    // add the new user message
    allMessages.push({
      role: 'user',
      content: message
    });
    
    // save the user message to database if we have a session
    if (actualSessionId) {
      try {
        const savedMessage = await messages.create({
          sessionId: actualSessionId,
          content: message,
          role: 'user'
        });
        
        // Update our in-memory cache
        if (!fallbackSessionHistory.has(actualSessionId)) {
          fallbackSessionHistory.set(actualSessionId, []);
        }
        fallbackSessionHistory.get(actualSessionId)?.push(savedMessage);
      } catch (error) {
        logger.warn('Failed to save user message to database', {
          error: error instanceof Error ? error.message : String(error),
          sessionId: actualSessionId
        });
        
        // Still update our in-memory cache
        if (!fallbackSessionHistory.has(actualSessionId)) {
          fallbackSessionHistory.set(actualSessionId, []);
        }
        
        const tempMessage = {
          id: uuidv4(),
          sessionId: actualSessionId,
          content: message,
          role: 'user',
          createdAt: new Date().toISOString()
        };
        
        fallbackSessionHistory.get(actualSessionId)?.push(tempMessage);
      }
    }
    
    // set response headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Important: disable Node.js compression which can cause buffering issues
    if (res.flush) {
      res.flush();
    }
    
    // Debug: log that we're starting the stream
    logger.debug('Starting SSE stream', { requestId });
    
    // start stream with metadata
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      request_id: requestId,
      model: model || 'llama3',
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
    
    // Modified: direct use of LLM service with proper message format
    const stream = await llmService.generateCompletion({
      modelId: model || 'llama3',
      messages: allMessages,
      options: options || {},
      userId: userId,
      conversationId: actualSessionId,
      streaming: true
    });
    
    // store stream controller for potential cancellation
    activeStreams.set(requestId, stream);
    
    // accumulate full response
    let fullResponse = '';
    
    // handle data events (chunks)
    stream.onData((chunk) => {
      try {
        // append to full response
        fullResponse += chunk.content;
        
        // send chunk to client
        const chunkData = JSON.stringify({
          type: 'content',
          content: chunk.content
        });
        
        res.write(`data: ${chunkData}\n\n`);
        
        // Force flush the response
        if (res.flush) {
          res.flush();
        }
      } catch (error) {
        logger.error('Error processing stream chunk', {
          error: error instanceof Error ? error.message : String(error),
          requestId
        });
      }
    });
    
    // handle end of stream
    stream.onEnd((usage) => {
      try {
        // send completion message
        res.write(`data: ${JSON.stringify({
          type: 'done',
          content: fullResponse,
          usage: usage || null
        })}\n\n`);
        
        // save assistant message to database if we have a session
        if (actualSessionId) {
          messages.create({
            sessionId: actualSessionId,
            content: fullResponse,
            role: 'assistant'
          }).then(savedMessage => {
            // Update our in-memory cache
            if (!fallbackSessionHistory.has(actualSessionId)) {
              fallbackSessionHistory.set(actualSessionId, []);
            }
            fallbackSessionHistory.get(actualSessionId)?.push(savedMessage);
          }).catch(error => {
            logger.error('Failed to save response to database', {
              error: error instanceof Error ? error.message : String(error),
              requestId,
              sessionId: actualSessionId
            });
            
            // Still update our in-memory cache
            if (!fallbackSessionHistory.has(actualSessionId)) {
              fallbackSessionHistory.set(actualSessionId, []);
            }
            
            const tempMessage = {
              id: uuidv4(),
              sessionId: actualSessionId,
              content: fullResponse,
              role: 'assistant',
              createdAt: new Date().toISOString()
            };
            
            fallbackSessionHistory.get(actualSessionId)?.push(tempMessage);
          });
        }
        
        // remove stream controller
        activeStreams.delete(requestId);
        
        // log completion
        logger.info('Stream completed successfully', {
          requestId,
          responseLength: fullResponse.length,
          tokensUsed: usage?.totalTokens || 0
        });
        
        // end response
        res.end();
      } catch (error) {
        logger.error('Error ending stream', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          requestId
        });
        
        // attempt to end the response
        try {
          res.end();
        } catch (endError) {
          logger.error('Error ending response after stream end error', {
            error: endError instanceof Error ? endError.message : String(endError),
            requestId
          });
        }
      }
    });
    
    // handle errors
    stream.onError((error) => {
      try {
        logger.error('Stream error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          requestId
        });
        
        // send error to client
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
          code: error.statusCode || 500
        })}\n\n`);
        
        // remove stream controller
        activeStreams.delete(requestId);
        
        // end response
        res.end();
      } catch (endError) {
        logger.error('Error ending response after stream error', {
          error: endError instanceof Error ? endError.message : String(endError),
          requestId
        });
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Invalid request data', { errors: error.errors });
      next(new ApiError(400, 'invalid request data', { context: { errors: error.errors } }));
    } else {
      logger.error('Error processing message', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      next(error instanceof ApiError ? error : new ApiError(500, 'failed to process message'));
    }
  }
};

/**
 * gets available models from the llm service
 */
export const getModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Directly use the LLM service to fetch models
    // This bypasses any Supabase dependency
    const models = await llmService.listModels();
    
    // Log success for debugging
    logger.info('Successfully fetched models from llm service', { 
      modelCount: models.length,
      models: models.map(m => m.id)
    });
    
    res.json({
      success: true,
      models
    });
  } catch (error) {
    // Enhanced error logging
    logger.error('error fetching models', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to fetch models'));
  }
};

/**
 * stops an in-progress generation
 */
export const stopGeneration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { request_id: requestId } = req.body;
    
    if (!requestId) {
      return next(new ApiError(400, 'request_id is required'));
    }
    
    // check if we have an active stream for this request
    if (activeStreams.has(requestId)) {
      const stream = activeStreams.get(requestId);
      
      if (stream && stream.abort) {
        // abort the stream
        stream.abort();
        
        // remove from active streams
        activeStreams.delete(requestId);
        
        res.json({
          success: true,
          message: 'generation stopped successfully'
        });
      } else {
        next(new ApiError(500, 'failed to stop generation'));
      }
    } else {
      next(new ApiError(404, 'no active generation found with this request id'));
    }
  } catch (error) {
    logger.error('error stopping generation', { error });
    next(error instanceof ApiError ? error : new ApiError(500, 'failed to stop generation'));
  }
};

/**
 * sends a message to the llm and returns a non-streaming response (for testing)
 */
export const sendMessageNonStreaming = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const requestId = uuidv4();
    
    // validate request body
    const validatedData = messageSchema.parse(req.body);
    const { message, model, session_id: sessionId, history, options } = validatedData;
    
    // prepare messages array for the LLM
    const allMessages: ChatMessage[] = [];
    
    // use provided history or empty array
    if (history) {
      allMessages.push(...history);
    }
    
    // add the new user message
    allMessages.push({
      role: 'user',
      content: message
    });
    
    logger.info('Non-streaming chat request', { 
      requestId, 
      model: model || 'llama3',
      messageLength: message.length 
    });
    
    // Call LLM with streaming disabled
    const request = {
      modelId: model || 'llama3',
      messages: allMessages,
      options: options || {},
      userId: req.user?.id,
      streaming: false
    };
    
    // Use a Promise to collect the full response
    let fullResponse = '';
    const stream = await llmService.generateCompletion(request);
    
    // Set up promise to wait for response
    const responsePromise = new Promise<string>((resolve, reject) => {
      // Handle data chunks
      stream.onData((chunk) => {
        fullResponse += chunk.content;
      });
      
      // Handle completion
      stream.onEnd(() => {
        resolve(fullResponse);
      });
      
      // Handle errors
      stream.onError((error) => {
        reject(error);
      });
      
      // Set a timeout (30 seconds)
      setTimeout(() => {
        reject(new Error('Response timeout'));
      }, 30000);
    });
    
    // Wait for the response
    const response = await responsePromise;
    
    // Return the full response
    res.json({
      success: true,
      requestId,
      response,
      model: model || 'llama3'
    });
  } catch (error) {
    logger.error('Error in non-streaming chat', { error });
    next(error instanceof ApiError ? error : new ApiError(500, 'Failed to generate response'));
  }
}; 