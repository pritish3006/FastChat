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
import { llmService as legacyLlmService, ChatMessage } from '../services/llm';
import { LLMService } from '../services/llm';
import { chatSessions, messages } from '../services/database';
import { ApiError } from '../middleware/errorHandler';
import { io } from '../index';
import logger from '../utils/logger';
import { config } from '../config';

// active stream controllers by request id
const activeStreams = new Map<string, any>();

// in-memory fallback for chat history when session can't be loaded
const fallbackSessionHistory = new Map<string, ChatMessage[]>();

// LLM service instances cache to avoid creating new instances for every request
const llmServiceCache = new Map<string, { service: LLMService, lastUsed: number }>();

// Cleanup service instances that haven't been used in 5 minutes
setInterval(() => {
  const now = Date.now();
  const staleTimeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [modelId, entry] of llmServiceCache.entries()) {
    if (now - entry.lastUsed > staleTimeout) {
      entry.service.shutdown().catch(err => {
        logger.warn('Error shutting down stale LLM service', {
          modelId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
      llmServiceCache.delete(modelId);
    }
  }
}, 60 * 1000); // Check every minute

// Get or create an LLM service instance
async function getLLMService(modelId: string): Promise<LLMService> {
  const cacheKey = modelId || config.llm.defaultModel;
  
  // Check if we have a cached instance
  if (llmServiceCache.has(cacheKey)) {
    const entry = llmServiceCache.get(cacheKey)!;
    entry.lastUsed = Date.now();
    return entry.service;
  }
  
  // Create new instance with OpenAI provider
  const service = new LLMService({
    model: {
      provider: 'openai',
      modelId: cacheKey,
      apiKey: config.llm.apiKey,
      temperature: config.llm.temperature ?? 0.7,
      maxTokens: config.llm.maxTokens ?? 2000
    },
    tools: {
      enabled: true,
      providers: {
        search: {
          enabled: true,
          apiKey: config.search.tavilyApiKey
        },
        voice: {
          enabled: true,
          sttApiKey: config.voice.sttApiKey,
          ttsApiKey: config.voice.ttsApiKey
        }
      }
    },
    memory: {
      redisUrl: config.redis.url,
      vectorStore: config.database.supabaseUrl && config.database.supabaseKey ? {
        type: 'supabase',
        supabaseUrl: config.database.supabaseUrl,
        supabaseKey: config.database.supabaseKey,
        embeddingModel: config.llm.embeddingModel || cacheKey
      } : undefined
    }
  });
  
  // Initialize the service
  await service.initialize();
  
  // Cache the instance
  llmServiceCache.set(cacheKey, {
    service,
    lastUsed: Date.now()
  });
  
  return service;
}

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
    stop: z.array(z.string()).optional(),
    enableTools: z.boolean().optional()
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
          modelId: model || config.llm.defaultModel
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
      model: model || config.llm.defaultModel,
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
    
    // Get or create an LLM service instance
    const llmService = await getLLMService(model || config.llm.defaultModel);
    
    // Create streaming callbacks
    const callbacks = {
      onToken: (token: string) => {
        try {
          const chunkData = JSON.stringify({
            type: 'content',
            content: token
          });
          res.write(`data: ${chunkData}\n\n`);
          
          // Force flush to avoid buffering
          if (res.flush) {
            res.flush();
          }
        } catch (error) {
          logger.error('Error sending chunk', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      },
      onStart: () => {
        try {
          const startData = JSON.stringify({
            type: 'start',
            timestamp: Date.now()
          });
          res.write(`data: ${startData}\n\n`);
          
          if (res.flush) {
            res.flush();
          }
        } catch (error) {
          logger.error('Error sending start event', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      },
      onComplete: () => {
        try {
          const completeData = JSON.stringify({
            type: 'done',
            timestamp: Date.now()
          });
          res.write(`data: ${completeData}\n\n`);
          res.end();
        } catch (error) {
          logger.error('Error sending complete event', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
          res.end();
        }
      },
      onError: (error: Error) => {
        try {
          const errorData = JSON.stringify({
            type: 'error',
            error: error.message
          });
          res.write(`data: ${errorData}\n\n`);
          res.end();
        } catch (streamError) {
          logger.error('Error sending error event', {
            requestId,
            originalError: error.message,
            streamError: streamError instanceof Error ? streamError.message : String(streamError)
          });
          res.end();
        }
      }
    };
    
    try {
      // Using the new LLM service to chat with vector store support
      const response = await llmService.chat({
        sessionId: actualSessionId,
        message: message,
        systemPrompt: options?.systemPrompt,
        callbacks: callbacks
      });
      
      // Add token usage headers if available
      if (response.metadata?.tokens) {
        res.setHeader('X-Tokens-Prompt', response.metadata.tokens.prompt);
        res.setHeader('X-Tokens-Completion', response.metadata.tokens.completion);
        res.setHeader('X-Tokens-Total', response.metadata.tokens.total);
      }
      
    } catch (error) {
      logger.error('error generating completion', {
        error: error instanceof Error ? error.message : String(error),
        requestId,
        model: model || config.llm.defaultModel
      });
      
      // try to send error to client
      try {
        const errorData = JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Error generating completion'
        });
        res.write(`data: ${errorData}\n\n`);
      } catch (writeError) {
        logger.error('Failed to write error to stream', {
          requestId,
          error: writeError instanceof Error ? writeError.message : String(writeError)
        });
      }
      
      // end the response
      res.end();
    }
    
  } catch (error) {
    // This catches validation errors and other issues before streaming starts
    logger.error('chat request error', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    next(error instanceof ApiError 
      ? error 
      : new ApiError(400, error instanceof Error ? error.message : 'invalid chat request'));
  }
};

/**
 * gets available models from the llm service
 */
export const getModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Directly use the LLM service to fetch models
    // This bypasses any Supabase dependency
    const models = await legacyLlmService.listModels();
    
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
    const stream = await legacyLlmService.generateCompletion(request);
    
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