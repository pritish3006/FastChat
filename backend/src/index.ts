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

// Import routers
import chatsRouter from './routes/chat';
import modelsRouter from './routes/models';
import tokensRouter from './routes/tokens';
import branchesRouter from './routes/branches';

// Display startup validation warnings
if (config.server.nodeEnv === 'development') {
  // Check if using fallback services
  if (config.llm.provider === 'ollama' && !process.env.OLLAMA_BASE_URL) {
    logger.info('using default ollama endpoint - ensure ollama is running locally');
  }
}

// Create Express app
const app = createApp();

// Register additional routes
app.use('/api/chats', chatsRouter);
app.use('/api/models', modelsRouter);
app.use('/api/tokens', tokensRouter);
app.use('/api/branches', branchesRouter);

// Create and initialize the HTTP server
const server = createServer(app);
setupGracefulShutdown(server);

// Start the server
const port = config.server.port;
startServer(server, port);

// Export the io instance from the server module for other modules to use
export { io } from './server/index'; 