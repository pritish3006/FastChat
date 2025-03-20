// @ts-nocheck
/**
 * server websocket
 * 
 * configures socket.io server
 * provides interfaces for real-time messaging
 */

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../utils/logger';
import { config } from '../config/index';
import { StreamingManager } from '../services/llm/streaming';
import { createLLMService } from '../services/llm';
import { eventEmitterToAsyncIterable } from '../services/llm/utils';

// Create streaming manager instance
const streamingManager = new StreamingManager();

// Create LLM service instance with configuration
console.log("***** Creating LLM service with config:", {
  provider: config.llm.provider,
  modelId: config.llm.defaultModel,
  apiKey: config.llm.openaiApiKey ? "***" : undefined,
  baseURL: config.llm.ollamaBaseUrl
});

const llmService = createLLMService({
  model: {
    provider: config.llm.provider,
    modelId: config.llm.defaultModel,
    apiKey: config.llm.openaiApiKey,
    baseURL: config.llm.ollamaBaseUrl, // Will be used if provider is ollama
    temperature: config.llm.temperature,
    topP: config.llm.topP,
    maxTokens: config.llm.maxTokens
  }
});

// Message types for client-server communication
export const MessageTypes = {
  // Client -> Server
  CHAT_REQUEST: 'chat_request',
  CANCEL_REQUEST: 'cancel_request',
  HISTORY_REQUEST: 'history_request',
  PING: 'ping',
  SELECT_MODEL: 'select_model',
  MODEL_SELECTED: 'model_selected',
  
  // Server -> Client
  CHAT_RESPONSE_CHUNK: 'chat_response_chunk',
  CHAT_RESPONSE_END: 'chat_response_end',
  HISTORY_UPDATE: 'history_update',
  ERROR: 'error',
  PONG: 'pong',
  CONNECTION_INFO: 'connection_info'
} as const;

interface ChatRequestData {
  requestId: string;
  content: string;
  conversationId: string;
  model: string;
  parentMessageId: string | null;
  type?: string; // Add type as an optional field
  options?: {
    temperature?: number;
    systemPrompt?: string;
  };
}

/**
 * creates and configures a socket.io server
 */
export function createWebSocketServer(httpServer: http.Server): SocketIOServer {
  console.log("***** Creating WebSocket server");
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`***** Client connected to Socket.IO: ${socket.id}`);
    logger.info('Client connected to Socket.IO:', socket.id);

    // Debug all received events
    socket.onAny((eventName, ...args) => {
      console.log(`***** Socket.IO received event: ${eventName}`, JSON.stringify(args).substring(0, 200) + '...');
      logger.debug(`Socket.IO received event: ${eventName}`, { 
        socketId: socket.id, 
        args: JSON.stringify(args).substring(0, 200) + '...' 
      });
    });

    // Function to handle chat request
    const handleChatRequest = async (data: ChatRequestData) => {
      console.log("***** handleChatRequest called with data:", JSON.stringify(data).substring(0, 200) + '...');
      logger.debug('handleChatRequest called with data:', { 
        data: JSON.stringify(data).substring(0, 200) + '...',
        dataType: typeof data,
        hasType: data && 'type' in data,
        type: data?.type,
        requestId: data?.requestId
      });

      // Check if data is valid
      if (!data || typeof data !== 'object') {
        console.log("***** Invalid data received:", data);
        logger.error('Invalid data received:', { data });
        return;
      }

      // If data comes from 'message' event, it might have a type field to check
      if (data.type && data.type !== 'chat_request') {
        console.log(`***** Ignoring non-chat request message: ${data.type}`);
        logger.debug('Ignoring non-chat request message:', { type: data.type });
        return;
      }

      // Generate requestId if not present
      const requestId = data.requestId || `req_${Date.now()}`;

      console.log(`***** [WEBSOCKET REQUEST RECEIVED] requestId: ${requestId}, model: ${data.model}`);
      logger.info('=== [WEBSOCKET REQUEST RECEIVED] ===', {
        requestId: requestId,
        modelId: data.model,
        sessionId: data.conversationId,
        socketId: socket.id,
        content: data.content && data.content.substring(0, 100) + '...',
        timestamp: new Date().toISOString(),
        provider: config.llm.provider
      });

      try {
        // Initialize the LLM service if not already done
        if (!llmService.initialized) {
          console.log("***** Initializing LLM service...");
          logger.debug('Initializing LLM service...');
          await llmService.initialize();
          console.log("***** LLM service initialized successfully");
        }

        console.log(`***** [PREPARING LLM REQUEST] provider: ${config.llm.provider}, model: ${data.model}`);
        logger.debug('=== [PREPARING LLM REQUEST] ===', {
          provider: config.llm.provider,
          model: data.model,
          requestId: requestId
        });

        // Extract system prompt from options if available
        const systemPrompt = data.options?.systemPrompt;

        // Use the LLM service to handle the chat
        console.log("***** Calling LLM service chat method...");
        logger.debug('Calling LLM service chat method with params:', {
          sessionId: data.conversationId || 'generated-uuid',
          message: data.content && data.content.substring(0, 100) + '...',
          hasParentMessageId: !!data.parentMessageId,
          hasSystemPrompt: !!systemPrompt
        });

        console.log(`***** About to call llmService.chat with message: ${data.content.substring(0, 50)}...`);
        
        await llmService.chat({
          sessionId: data.conversationId || crypto.randomUUID(), // Generate UUID if none provided
          message: data.content,
          parentMessageId: data.parentMessageId || undefined,
          systemPrompt,
          callbacks: {
            onToken: (token: string) => {
              console.log(`***** Token received from LLM (length: ${token.length}): ${token.substring(0, 20)}...`);
              logger.debug('Token received from LLM', { 
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + '...',
                requestId: requestId
              });
              
              // Emit the response chunk to the client
              console.log("***** Emitting CHAT_RESPONSE_CHUNK event");
              logger.debug('Emitting CHAT_RESPONSE_CHUNK event');
              socket.emit(MessageTypes.CHAT_RESPONSE_CHUNK, {
                requestId: requestId,
                content: token,
                conversationId: data.conversationId
              });
            },
            onComplete: () => {
              console.log(`***** [CHAT RESPONSE COMPLETE] requestId: ${requestId}`);
              logger.info('=== [CHAT RESPONSE COMPLETE] ===', {
                requestId: requestId
              });
              
              // Emit completion to the client
              console.log("***** Emitting CHAT_RESPONSE_END event");
              logger.debug('Emitting CHAT_RESPONSE_END event');
              socket.emit(MessageTypes.CHAT_RESPONSE_END, {
                requestId: requestId,
                conversationId: data.conversationId,
                messageId: requestId, // Using requestId as messageId for simplicity
                done: true
              });
            },
            onError: (error: Error) => {
              console.log(`***** Error in chat response: ${error.message}`);
              logger.error('Error in chat response', {
                error: error.message,
                stack: error.stack,
                requestId: requestId
              });
              
              // Emit error to the client
              console.log("***** Emitting ERROR event");
              logger.debug('Emitting ERROR event');
              socket.emit(MessageTypes.ERROR, {
                type: MessageTypes.ERROR,
                code: 'CHAT_ERROR',
                message: error.message,
                requestId: requestId
              });
            }
          }
        });

        console.log("***** llmService.chat call completed");

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.log(`***** [ERROR] Failed to handle chat request: ${errorMessage}`);
        logger.error('=== [ERROR] Failed to handle chat request ===', {
          requestId: requestId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
        socket.emit(MessageTypes.ERROR, {
          type: MessageTypes.ERROR,
          code: 'CHAT_REQUEST_ERROR',
          message: errorMessage,
          requestId: requestId
        });
      }
    };

    // Handle both 'message' and explicit 'chat_request' events
    socket.on('message', (data) => {
      console.log(`***** Received "message" event: ${JSON.stringify(data).substring(0, 200)}...`);
      logger.debug('Received "message" event:', { data: JSON.stringify(data).substring(0, 200) + '...' });
      handleChatRequest(data);
    });
    
    socket.on(MessageTypes.CHAT_REQUEST, (data) => {
      console.log(`***** Received "chat_request" event: ${JSON.stringify(data).substring(0, 200)}...`);
      logger.debug('Received "chat_request" event:', { data: JSON.stringify(data).substring(0, 200) + '...' });
      handleChatRequest(data);
    });

    // Add a handler for the CANCEL_REQUEST event
    socket.on(MessageTypes.CANCEL_REQUEST, (data) => {
      console.log(`***** Received "cancel_request" event: ${JSON.stringify(data)}`);
      logger.debug('Received "cancel_request" event:', { data });
      // Implementation for canceling requests would go here
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`***** Client disconnected from Socket.IO: ${socket.id}, reason: ${reason}`);
      logger.info('Client disconnected from Socket.IO:', socket.id);
    });
  });
  
  return io;
}

/**
 * initializes the websocket service with the given server
 */
export function initializeWebSocketService(io: SocketIOServer): void {
  console.log("***** Initializing WebSocket service");
  
  // Initialize the LLM service
  llmService.initialize().then(() => {
    console.log("***** LLM service initialized for WebSocket");
    logger.info('LLM service initialized for WebSocket');
  }).catch((error) => {
    console.log(`***** Failed to initialize LLM service for WebSocket: ${error.message}`);
    logger.error('Failed to initialize LLM service for WebSocket', { error });
  });
  
  try {
    const websocketService = require('../services/websocket').default;
    websocketService.setupSocketEvents();
    console.log("***** WebSocket service initialized");
    logger.info('WebSocket service initialized');
  } catch (error) {
    console.log(`***** Failed to initialize WebSocket service: ${error.message}`);
    logger.error('Failed to initialize WebSocket service', { originalError: error });
  }
} 