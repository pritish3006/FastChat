/**
 * websocket service
 * 
 * manages socket.io connections and events.
 * handles real-time message streaming between client and server.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../../utils/logger';
import { LLMService } from '../llm';
import config from '../../config';

// Temporary auth stub until we implement the full auth service
// TODO: Replace with actual auth service import when implemented
async function verifyToken(token: string): Promise<string | null> {
  // Simple stub that accepts tokens in format "user_123"
  if (token && token.startsWith('user_')) {
    return token.substring(5);
  }
  return null;
}

import {
  ChatRequestMessage,
  CancelRequestMessage,
  HistoryRequestMessage,
  ClientMessage,
  ServerMessage,
  ChatMessage,
  SocketData
} from '../../types/websocket';

// global socket server instance
let io: SocketIOServer;
// global LLM service instance
let llmService: LLMService;

/**
 * message types for client-server communication
 */
export const MessageTypes = {
  // client -> server
  CHAT_REQUEST: 'chat_request',
  CANCEL_REQUEST: 'cancel_request',
  HISTORY_REQUEST: 'history_request',
  PING: 'ping',
  
  // server -> client
  CHAT_RESPONSE_CHUNK: 'chat_response_chunk',
  CHAT_RESPONSE_END: 'chat_response_end',
  HISTORY_UPDATE: 'history_update',
  ERROR: 'error',
  PONG: 'pong'
};

/**
 * initialize llm service
 */
async function initializeLLMService(): Promise<void> {
  if (!llmService) {
    try {
      llmService = new LLMService(config.llm);
      await llmService.initialize();
      logger.info('LLM service initialized for WebSocket integration');
    } catch (error) {
      logger.error('Failed to initialize LLM service for WebSocket:', error);
      throw error;
    }
  }
}

/**
 * initialize socket io server
 */
export function initialize(server): void {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Initialize LLM service
  initializeLLMService().catch(error => {
    logger.error('Failed to initialize LLM service:', error);
  });

  setupSocketEvents();
}

/**
 * sets up socket event listeners and handlers
 */
export function setupSocketEvents(): void {
  if (!io) {
    logger.error('socket.io server not initialized');
    return;
  }
  
  // middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        // allow anonymous connections with limited functionality
        socket.data.userId = null;
        socket.data.isAuthenticated = false;
        return next();
      }
      
      const userId = await verifyToken(token);
      if (userId) {
        socket.data.userId = userId;
        socket.data.isAuthenticated = true;
        return next();
      }
      
      return next(new Error('authentication failed'));
    } catch (error) {
      logger.error('socket authentication error', { originalError: error });
      return next(new Error('authentication error'));
    }
  });
  
  // connection handler
  io.on('connection', handleConnection);
  
  logger.info('websocket event handlers initialized');
}

/**
 * handles new socket connections
 */
function handleConnection(socket: Socket): void {
  const authStatus = socket.data.isAuthenticated ? 'authenticated' : 'anonymous';
  logger.info(`client connected: ${socket.id} (${authStatus})`);
  
  // setup event listeners
  setupSocketListeners(socket);
  
  // setup reconnection info
  sendReconnectionInfo(socket);
  
  // handle disconnection
  socket.on('disconnect', () => {
    logger.info(`client disconnected: ${socket.id}`);
    // cleanup any active processes for this socket
    cancelActiveRequests(socket.id);
  });
}

/**
 * sets up event listeners for a socket
 */
function setupSocketListeners(socket: Socket): void {
  // heartbeat
  socket.on(MessageTypes.PING, () => {
    socket.emit(MessageTypes.PONG);
  });
  
  // chat request
  socket.on(MessageTypes.CHAT_REQUEST, async (data: ChatRequestMessage) => {
    try {
      await handleChatRequest(socket, data);
    } catch (error) {
      logger.error('error handling chat request', { socketId: socket.id, originalError: error });
      socket.emit(MessageTypes.ERROR, { 
        type: MessageTypes.ERROR,
        message: 'failed to process chat request',
        code: 'chat_processing_error'
      });
    }
  });
  
  // cancel request
  socket.on(MessageTypes.CANCEL_REQUEST, (data: CancelRequestMessage) => {
    try {
      cancelRequest(socket.id, data.requestId);
    } catch (error) {
      logger.error('error cancelling request', { socketId: socket.id, originalError: error });
      socket.emit(MessageTypes.ERROR, { 
        type: MessageTypes.ERROR,
        message: 'failed to cancel request',
        code: 'cancel_error'
      });
    }
  });
  
  // history request
  socket.on(MessageTypes.HISTORY_REQUEST, async (data: HistoryRequestMessage) => {
    try {
      await handleHistoryRequest(socket, data);
    } catch (error) {
      logger.error('error handling history request', { socketId: socket.id, originalError: error });
      socket.emit(MessageTypes.ERROR, { 
        type: MessageTypes.ERROR,
        message: 'failed to fetch chat history',
        code: 'history_error'
      });
    }
  });
}

/**
 * sends reconnection info to client
 */
function sendReconnectionInfo(socket: Socket): void {
  socket.emit('connection_info', {
    clientId: socket.id,
    reconnectBackoff: {
      initialDelay: 1000,
      maxDelay: 30000,
      factor: 1.5
    }
  });
}

/**
 * map to track active requests by socket and request id
 * note: for future scaling, this would move to redis for multi-server support
 */
const activeRequests = new Map<string, Set<string>>();

/**
 * handles incoming chat requests
 */
async function handleChatRequest(
  socket: Socket, 
  data: ChatRequestMessage
): Promise<void> {
  const { content, conversationId, parentMessageId, model, requestId = generateRequestId() } = data;
  const userId = socket.data.userId || 'anonymous';
  
  // track this request
  trackRequest(socket.id, requestId);
  
  // validation
  if (!content) {
    socket.emit(MessageTypes.ERROR, { 
      type: MessageTypes.ERROR,
      message: 'message content is required',
      code: 'invalid_request',
      requestId
    });
    untrackRequest(socket.id, requestId);
    return;
  }
  
  // Check if LLM service is available
  if (!llmService) {
    try {
      await initializeLLMService();
    } catch (error) {
      socket.emit(MessageTypes.ERROR, {
        type: MessageTypes.ERROR,
        message: 'LLM service unavailable',
        code: 'service_unavailable',
        requestId
      });
      untrackRequest(socket.id, requestId);
      return;
    }
  }
  
  try {
    // Convert WebSocket to required format for LLM service
    const ws = {
      send: (data: string) => {
        // Check if request is still active before sending anything
        if (!isRequestActive(socket.id, requestId)) return;
        
        const parsed = JSON.parse(data);
        switch (parsed.type) {
          case 'token':
            socket.emit(MessageTypes.CHAT_RESPONSE_CHUNK, {
              requestId,
              content: parsed.content,
              conversationId,
              modelId: model
            });
            break;
          case 'stream_start':
            socket.emit('stream_start', {
              requestId,
              conversationId,
              messageId: parsed.messageId
            });
            break;
          case 'stream_end':
            socket.emit(MessageTypes.CHAT_RESPONSE_END, {
              requestId,
              conversationId,
              content: parsed.content
            });
            // Cleanup request tracking
            untrackRequest(socket.id, requestId);
            break;
          case 'stream_error':
            socket.emit(MessageTypes.ERROR, {
              type: MessageTypes.ERROR,
              message: parsed.error,
              code: 'llm_error',
              requestId
            });
            // Cleanup request tracking
            untrackRequest(socket.id, requestId);
            break;
          case 'stream_cancelled':
            socket.emit('stream_cancelled', {
              requestId,
              conversationId
            });
            // Cleanup request tracking
            untrackRequest(socket.id, requestId);
            break;
          default:
            // Pass through any other message types
            socket.emit(parsed.type, {
              ...parsed,
              requestId
            });
        }
      },
      on: (event: string, callback: Function) => {
        // Add event listeners for the custom WebSocket object
        // Not needed in this implementation since we're using Socket.io
      }
    } as unknown as WebSocket;
    
    // Call LLM service with WebSocket for streaming
    const response = await llmService.chat({
      sessionId: conversationId,
      message: content,
      parentMessageId,
      websocket: ws,
      callbacks: {
        onStart: () => {
          // Could emit additional events here
        },
        onError: (error) => {
          logger.error(`LLM error for request ${requestId}:`, error);
        }
      }
    });
    
    // The completion is handled by the streaming mechanism
    // This is only reached for non-streaming responses
    
  } catch (error) {
    logger.error(`Error handling chat request ${requestId}:`, error);
    socket.emit(MessageTypes.ERROR, {
      type: MessageTypes.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'processing_error',
      requestId
    });
    
    // Cleanup request tracking
    untrackRequest(socket.id, requestId);
  }
}

/**
 * handles history requests
 */
async function handleHistoryRequest(socket: Socket, data: HistoryRequestMessage): Promise<void> {
  const { conversationId } = data;
  
  // todo: implement actual history fetching from database
  // for now, return mock history
  
  socket.emit(MessageTypes.HISTORY_UPDATE, {
    conversationId,
    messages: [
      {
        id: 'mock-msg-1',
        role: 'user',
        content: 'Hello, how are you?',
        timestamp: Date.now() - 60000
      },
      {
        id: 'mock-msg-2',
        role: 'assistant',
        content: 'I am doing well, thank you for asking.',
        timestamp: Date.now() - 55000
      }
    ]
  });
}

/**
 * cancels a specific request
 */
async function cancelRequest(socketId: string, requestId: string): Promise<void> {
  if (isRequestActive(socketId, requestId) && llmService) {
    // Get socket from socketId (you would need to maintain a map)
    const socket = io.sockets.sockets.get(socketId);
    
    if (socket) {
      try {
        // Cancel the stream using streaming manager
        // This assumes the requestId from the client matches the one in streaming manager
        // In a real implementation, you might need to map between them
        if (llmService.streamingManager && await llmService.streamingManager.cancelStream(requestId)) {
          socket.emit('stream_cancelled', { requestId });
        }
        
        // Untrack request
        untrackRequest(socketId, requestId);
      } catch (error) {
        logger.error(`Error cancelling request ${requestId}:`, error);
      }
    }
  }
}

/**
 * cancels all active requests for a socket
 */
function cancelActiveRequests(socketId: string): void {
  if (activeRequests.has(socketId)) {
    activeRequests.delete(socketId);
    logger.info(`all requests cancelled for disconnected socket: ${socketId}`);
    
    // todo: notify llm service to stop processing all requests from this socket
  }
}

/**
 * tracks an active request
 */
function trackRequest(socketId: string, requestId: string): void {
  if (!activeRequests.has(socketId)) {
    activeRequests.set(socketId, new Set());
  }
  activeRequests.get(socketId)?.add(requestId);
}

/**
 * untracks a request when complete or cancelled
 */
function untrackRequest(socketId: string, requestId: string): void {
  activeRequests.get(socketId)?.delete(requestId);
  if (activeRequests.get(socketId)?.size === 0) {
    activeRequests.delete(socketId);
  }
}

/**
 * checks if a request is currently active
 */
function isRequestActive(socketId: string, requestId: string): boolean {
  return activeRequests.get(socketId)?.has(requestId) ?? false;
}

/**
 * generates a unique request id
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * sets the socket.io server instance
 */
export function setSocketServer(socketServer: SocketIOServer): void {
  io = socketServer;
  logger.info('socket.io server instance set in websocket service');
}

export default {
  setupSocketEvents,
  setSocketServer
}; 