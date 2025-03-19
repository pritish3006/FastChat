/**
 * server module
 * 
 * central entry point for server setup and initialization
 * composes modular components into a complete server
 */

import express, { Application } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { applyAllMiddleware } from './middleware';
import { registerAllRoutes } from './routes';
import { createWSServer } from './trpc';
import { errorHandler } from '../middleware/errorHandler';
import { config } from '../config/index';
import { createContext } from './trpc';
import { appRouter } from './routers';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { LLMWebSocketManager } from '../services/llm/websocket';
import logger from '../utils/logger';

// WebSocket server instance
export let wss: WebSocketServer;
export let llmWSManager: LLMWebSocketManager;

/**
 * creates the express application with all middleware and routes
 */
export function createApp(): Application {
  const app = express();
  
  // Apply middleware
  applyAllMiddleware(app);
  
  // Create tRPC HTTP handler
  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext
  });
  
  // Mount tRPC handler
  app.use('/trpc', trpcHandler);
  
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
  wss = new WebSocketServer({ server });
  
  // Create LLM WebSocket manager
  llmWSManager = new LLMWebSocketManager(
    global.llmService,
    global.redisManager
  );
  
  // Apply tRPC WebSocket handler
  const wssHandler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext
  });
  
  // Handle WebSocket connection
  wss.on('connection', (ws) => {
    logger.info('Client connected to WebSocket');
    
    ws.on('close', () => {
      logger.info('Client disconnected from WebSocket');
    });
  });
  
  // Cleanup handler
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    wssHandler.broadcastReconnectNotification();
    wss.close();
  });
  
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
  
  return server;
}

// Start the server if this file is executed directly
if (require.main === module) {
  const server = initializeServer();
  const port = config.server.port;
  server.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });
}

// Export the app for testing
export default createApp(); 