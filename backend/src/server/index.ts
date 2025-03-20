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
import { createWSServer } from './trpc';
import { errorHandler } from '../middleware/errorHandler';
import { config } from '../config/index';
import { createContext } from './trpc';
import { appRouter } from './routers';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { LLMWebSocketManager } from '../services/llm/websocket';
import { RedisMemory } from '../services/llm/memory/redis';
import logger from '../utils/logger';
import { llmService, initializeServices } from './lifecycle';

// WebSocket server instance
export let io: SocketIOServer;
export let llmWSManager: LLMWebSocketManager;

/**
 * creates the express application with all middleware and routes
 */
export function createApp(): Application {
  try {
    logger.info('Creating Express application...');
    const app = express();
    
    try {
      logger.info('Applying middleware...');
      // Apply middleware
      applyAllMiddleware(app);
      logger.info('Middleware applied successfully');
    } catch (error) {
      logger.error('Error applying middleware:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Creating tRPC HTTP handler...');
      // Create tRPC HTTP handler
      const trpcHandler = createHTTPHandler({
        router: appRouter,
        createContext
      });
      
      // Mount tRPC handler
      app.use('/trpc', trpcHandler);
      logger.info('tRPC HTTP handler created and mounted successfully');
    } catch (error) {
      logger.error('Error creating or mounting tRPC HTTP handler:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Registering routes...');
      // Register routes
      registerAllRoutes(app);
      logger.info('Routes registered successfully');
    } catch (error) {
      logger.error('Error registering routes:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Applying error handling middleware...');
      // Apply error handling (must be last)
      app.use(errorHandler);
      logger.info('Error handling middleware applied successfully');
    } catch (error) {
      logger.error('Error applying error handling middleware:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    logger.info('Express application created successfully');
    return app;
  } catch (error) {
    logger.error('Failed to create Express application:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    throw error;
  }
}

/**
 * creates the http server and sets up websockets
 */
export async function createServer(app: Application): Promise<http.Server> {
  try {
    logger.info('Creating HTTP server...');
    // Create http server
    const server = http.createServer(app);
    
    try {
      logger.info('Initializing services...');
      // Initialize services first
      await initializeServices();
      logger.info('Services initialized successfully');
    } catch (error) {
      logger.error('Error initializing services:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Initializing Socket.IO server...');
      // Initialize Socket.IO server
      io = new SocketIOServer(server, {
        cors: {
          origin: config.cors.allowedOrigins,
          methods: ['GET', 'POST'],
          credentials: true
        }
      });
      logger.info('Socket.IO server initialized successfully');
    } catch (error) {
      logger.error('Error initializing Socket.IO server:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Creating Redis memory for WebSocket...');
      // Create Redis manager for WebSocket
      const redisMemory = new RedisMemory({
        enabled: true,
        url: 'redis://localhost:6379',
        prefix: 'fast-chat:memory:',
        sessionTTL: 24 * 60 * 60
      });
      
      // Create LLM WebSocket manager with Redis
      llmWSManager = new LLMWebSocketManager(llmService, redisMemory);
      logger.info('LLM WebSocket manager created successfully');
    } catch (error) {
      logger.error('Error creating Redis memory or LLM WebSocket manager:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    try {
      logger.info('Setting up Socket.IO connection handling...');
      // Handle Socket.IO connection
      io.on('connection', (socket) => {
        logger.info(`Client connected to Socket.IO: ${socket.id}`);
        
        // Handle authentication
        socket.on('auth', (data) => {
          logger.info(`Client authenticated: ${socket.id}`, { sessionId: data.sessionId });
          socket.emit('message', {
            type: 'CONNECTION_INFO',
            status: 'authenticated',
            sessionId: data.sessionId
          });
        });

        // Handle chat requests
        socket.on('chat_request', (data) => {
          logger.info(`Received chat request from client: ${socket.id}`, data);
          llmWSManager.handleChatRequest(socket, data);
        });

        // Handle ping messages
        socket.on('ping', (data) => {
          logger.info(`Received ping from client: ${socket.id}`, data);
          socket.emit('pong', {
            receivedAt: new Date().toISOString(),
            echo: data
          });
        });
        
        socket.on('disconnect', () => {
          logger.info(`Client disconnected from Socket.IO: ${socket.id}`);
        });
      });
      logger.info('Socket.IO connection handling set up successfully');
    } catch (error) {
      logger.error('Error setting up Socket.IO connection handling:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }

    logger.info('HTTP server created successfully');
    return server;
  } catch (error) {
    logger.error('Failed to create HTTP server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    throw error;
  }
}

/**
 * initializes and starts the full server
 */
export async function initializeServer(): Promise<http.Server> {
  try {
    logger.info('Initializing server...');
    // Create the application
    const app = createApp();
    
    // Create the server
    const server = await createServer(app);
    
    logger.info('Server initialization completed successfully');
    return server;
  } catch (error) {
    logger.error('Failed to initialize server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    throw error;
  }
}

// Start the server if this file is executed directly
if (require.main === module) {
  initializeServer().then(server => {
    const port = config.server.port;
    server.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
    });
  }).catch(error => {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  });
} 