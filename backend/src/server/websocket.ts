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

/**
 * creates and configures a socket.io server
 */
export function createWebSocketServer(httpServer: http.Server): SocketIOServer {
  // Create socket.io server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Performance optimizations
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000
  });
  
  // Log connection info
  io.on('connection', (socket) => {
    logger.info(`client connected: ${socket.id}`);
    
    socket.on('disconnect', () => {
      logger.info(`client disconnected: ${socket.id}`);
    });
  });
  
  return io;
}

/**
 * initializes the websocket service with the given server
 */
export function initializeWebSocketService(io: SocketIOServer): void {
  // Import websocket service 
  try {
    const websocketService = require('../services/websocket').default;
    websocketService.setupSocketEvents();
    logger.info('websocket service initialized');
  } catch (error) {
    logger.error('failed to initialize websocket service', { originalError: error });
  }
} 