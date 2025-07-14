/**
 * server module
 * 
 * central entry point for server setup and initialization
 * composes modular components into a complete server
 */

import express, { Application } from 'express';
import http from 'http';
import { applyAllMiddleware } from './middleware';
import { registerAllRoutes } from './routes';
import { errorHandler } from '../middleware/errorHandler';
import { config } from '../config/index';
import { createContext } from './trpc';
import { appRouter } from './routers';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import logger from '../utils/logger';
import { initializeServices } from './lifecycle';

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
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    process.exit(1);
  });
} 