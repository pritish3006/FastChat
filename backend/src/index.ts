/**
 * fast chat backend application
 * 
 * main entry point for the backend server.
 * initializes the server using the modular server architecture.
 */

import { createApp, createServer } from './server/index';
import { startServer } from './server/lifecycle';
import { config } from './config/index';
import logger from './utils/logger';
import { setupGracefulShutdown } from './server/lifecycle';

// Display startup validation warnings
if (config.server.nodeEnv === 'development') {
  // Check if using fallback services
  if (config.llm.provider === 'ollama' && !process.env.OLLAMA_BASE_URL) {
    logger.info('using default ollama endpoint - ensure ollama is running locally');
  }
}

async function main() {
  try {
    // Create Express app
    const app = createApp();

    // Create and initialize the HTTP server
    const server = await createServer(app);
    setupGracefulShutdown(server);

    // Start the server
    const port = config.server.port;
    await startServer(server, port);
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available',
      name: error instanceof Error ? error.name : 'Unknown error type'
    });
    process.exit(1);
  }
}

// Start the server
main().catch(error => {
  logger.error('Unhandled error:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : 'No stack trace available',
    name: error instanceof Error ? error.name : 'Unknown error type'
  });
  process.exit(1);
});

// Export the io instance from the server module for other modules to use
export { io } from './server/index'; 