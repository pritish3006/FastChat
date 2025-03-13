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
    
    // validate request body
    const validatedData = messageSchema.parse(req.body);
    const { message, model, session_id: sessionId, history, options } = validatedData;
    
    // get or create a session id
    const userId = req.user?.id || 'anonymous';
    let actualSessionId = sessionId;
    
    if (!actualSessionId && req.user) {
      // create a new session if user is authenticated
      const newSession = await chatSessions.create({
        userId: req.user.id,
        title: message.substring(0, 50),
        modelId: model || 'llama3'
      });
      actualSessionId = newSession.id;
    }
    
    // prepare messages array for the LLM
    const allMessages: ChatMessage[] = [];
    
    // use provided history or fetch from database
    if (history) {
      allMessages.push(...history);
    } else if (actualSessionId) {
      // fetch history from database if session exists
      const sessionMessages = await messages.getBySessionId(actualSessionId);
      
      if (sessionMessages.length > 0) {
        for (const msg of sessionMessages) {
          allMessages.push({
            role: msg.role,
            content: msg.content
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
      await messages.create({
        sessionId: actualSessionId,
        content: message,
        role: 'user'
      });
    }
    
    // set response headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // start stream with metadata
    res.write(`data: ${JSON.stringify({
      type: 'metadata',
      request_id: requestId,
      model: model || 'llama3',
      session_id: actualSessionId
    })}\n\n`);
    
    // start streaming completion
    const stream = await llmService.generateCompletion({
      prompt: llmService.messagesToPrompt(allMessages.filter(m => m.role !== 'system')),
      model: model || 'llama3',
      systemPrompt: allMessages.find(m => m.role === 'system')?.content,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
      topP: options?.top_p,
      stop: options?.stop
    });
    
    // store stream controller for potential cancellation
    activeStreams.set(requestId, stream);
    
    // accumulate full response
    let fullResponse = '';
    
    // handle data events
    stream.on('data', (data: any) => {
      const token = data.response;
      fullResponse += token;
      
      // send token to client
      res.write(`data: ${JSON.stringify({
        type: 'token',
        token,
        done: data.done
      })}\n\n`);
    });
    
    // handle end of stream
    stream.on('end', async (data: any) => {
      // send completion message
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        content: fullResponse
      })}\n\n`);
      
      // save assistant message to database if we have a session
      if (actualSessionId) {
        await messages.create({
          sessionId: actualSessionId,
          content: fullResponse,
          role: 'assistant'
        });
      }
      
      // remove stream controller
      activeStreams.delete(requestId);
      
      // end response
      res.end();
    });
    
    // handle errors
    stream.on('error', (error: any) => {
      logger.error('stream error', { error, requestId });
      
      // send error to client
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message || 'Unknown error',
        code: error.statusCode || 500
      })}\n\n`);
      
      // remove stream controller
      activeStreams.delete(requestId);
      
      // end response
      res.end();
    });
    
    // handle client disconnect
    req.on('close', () => {
      if (activeStreams.has(requestId)) {
        const stream = activeStreams.get(requestId);
        if (stream && stream.abort) {
          stream.abort();
        }
        activeStreams.delete(requestId);
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ApiError(400, 'invalid request data', { context: { errors: error.errors } }));
    } else {
      logger.error('error processing message', { error });
      next(error instanceof ApiError ? error : new ApiError(500, 'failed to process message'));
    }
  }
};

/**
 * gets available models from the llm service
 */
export const getModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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