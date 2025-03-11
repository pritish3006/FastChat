/**
 * server module
 * 
 * central entry point for server setup and initialization
 * composes modular components into a complete server
 */

import express, { Application } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { applyAllMiddleware } from './middleware';
import { registerAllRoutes } from './routes';
import { createWebSocketServer, initializeWebSocketService } from './websocket';
import { startServer, setupGracefulShutdown } from './lifecycle';
import { errorHandler } from '../middleware/errorHandler';
import { config } from '../config/index';

// Socket.io server instance
export let io: SocketIOServer;

/**
 * creates the express application with all middleware and routes
 */
export function createApp(): Application {
  // Create express application
  const app = express();
  
  // Apply middleware
  applyAllMiddleware(app);
  
  // Register routes
  registerAllRoutes(app);
  
  // Apply error handling (must be last)
  app.use(errorHandler);
  
  return app;
}

/**
 * creates the http server and sets up websockets
 */
export function createServer(app: Application): http.Server {
  // Create http server
  const server = http.createServer(app);
  
  // Initialize WebSocket server
  io = createWebSocketServer(server);
  
  // Initialize websocket service
  initializeWebSocketService(io);
  
  return server;
}

/**
 * initializes and starts the full server
 */
export function initializeServer(): http.Server {
  // Create the application
  const app = createApp();
  
  // Create the server
  const server = createServer(app);
  
  // Set up graceful shutdown
  setupGracefulShutdown(server);
  
  return server;
}

// Start the server if this file is executed directly
if (require.main === module) {
  const server = initializeServer();
  const port = config.server.port;
  
  // Start the server
  startServer(server, port);
}

// Export the app for testing
export default createApp(); 