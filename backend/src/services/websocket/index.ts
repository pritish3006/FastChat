/**
 * websocket service
 * 
 * manages socket.io connections and events.
 * handles real-time message streaming between client and server.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../../utils/logger';

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
): Promise<void> { // TODO: add actual llm service integration here
  const { content, conversationId, parentMessageId, model } = data;
  const requestId = generateRequestId();
  
  // track this request
  trackRequest(socket.id, requestId);
  
  // validation
  if (!content) {
    socket.emit(MessageTypes.ERROR, { 
      type: MessageTypes.ERROR,
      message: 'message content is required',
      code: 'invalid_request'
    });
    return;
  }
  
  // todo: implement actual llm service integration here
  // for now, just echo back the request with simulated chunks
  
  // simulate streaming chunks
  setTimeout(() => {
    if (!isRequestActive(socket.id, requestId)) return;
    
    socket.emit(MessageTypes.CHAT_RESPONSE_CHUNK, {
      requestId,
      content: 'This is ',
      conversationId
    });
  }, 500);
  
  setTimeout(() => {
    if (!isRequestActive(socket.id, requestId)) return;
    
    socket.emit(MessageTypes.CHAT_RESPONSE_CHUNK, {
      requestId,
      content: 'a simulated ',
      conversationId
    });
  }, 1000);
  
  setTimeout(() => {
    if (!isRequestActive(socket.id, requestId)) return;
    
    socket.emit(MessageTypes.CHAT_RESPONSE_CHUNK, {
      requestId,
      content: 'response from the LLM service.',
      conversationId
    });
    
    // signal end of response
    socket.emit(MessageTypes.CHAT_RESPONSE_END, {
      requestId,
      conversationId
    });
    
    // cleanup request tracking
    untrackRequest(socket.id, requestId);
  }, 1500);
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
function cancelRequest(socketId: string, requestId: string): void {
  if (isRequestActive(socketId, requestId)) {
    untrackRequest(socketId, requestId);
    logger.info(`request cancelled: ${requestId} for socket ${socketId}`);
    
    // todo: notify llm service to stop processing
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