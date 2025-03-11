/**
 * fast chat backend application
 * 
 * main entry point for the backend server.
 * initializes the server using the modular server architecture.
 */

import { initializeServer } from './server/index';
import { startServer } from './server/lifecycle';
import { config } from './config/index';
import logger from './utils/logger';

// Display startup validation warnings
if (config.server.nodeEnv === 'development') {
  // Check if using fallback services
  if (config.llm.provider === 'ollama' && !process.env.OLLAMA_BASE_URL) {
    logger.info('using default ollama endpoint - ensure ollama is running locally');
  }
}

// Initialize the server
const server = initializeServer();

// Start the server
const port = config.server.port;
startServer(server, port);

// Export the io instance from the server module for other modules to use
export { io } from './server/index'; 