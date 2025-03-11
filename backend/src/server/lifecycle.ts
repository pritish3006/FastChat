/**
 * server lifecycle
 * 
 * handles server startup, shutdown, and signals
 * ensures graceful handling of connections
 */

import http from 'http';
import logger from '../utils/logger';

/**
 * starts the server and listens on the specified port
 */
export function startServer(server: http.Server, port: number): void {
  server.listen(port, () => {
    logger.info(`server started on port ${port}`);
    logger.info(`health check: http://localhost:${port}/health`);
    logger.info(`api: http://localhost:${port}/api/v1`);
  });
}

/**
 * handles graceful shutdown of the server
 */
export function setupGracefulShutdown(server: http.Server): void {
  // Function to perform graceful shutdown
  const gracefulShutdown = (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown`);
    
    // Set a timeout for forceful exit
    const forceExit = setTimeout(() => {
      logger.error('could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000); // 30 second timeout
    
    // Attempt to close the server
    server.close(() => {
      logger.info('closed all connections gracefully');
      clearTimeout(forceExit);
      process.exit(0);
    });
  };
  
  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('unhandled promise rejection', { reason, promise });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error });
    
    // Exit with error
    process.exit(1);
  });
} 