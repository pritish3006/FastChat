/**
 * server lifecycle
 * 
 * handles server startup, shutdown, and signals
 * ensures graceful handling of connections
 */

import { Server } from 'http';
import { config } from '../config/index';
import { createLLMService, LLMService } from '../services/llm';
import { checkRequiredServices } from '../services/health';
import logger from '../utils/logger';
import { LLMServiceConfig } from '../services/llm/types';

// Global service instances
export let llmService: LLMService;

/**
 * initializes all required services
 */
export async function initializeServices(): Promise<void> {
  try {
    // Check if required services are running
    const servicesUp = await checkRequiredServices();
    if (!servicesUp) {
      throw new Error('Required services are not running');
    }

    // Create LLM service configuration
    const llmConfig: LLMServiceConfig = {
      model: {
        provider: config.llm.provider,
        modelId: config.llm.defaultModel,
        // Set baseURL based on provider
        ...(config.llm.provider === 'ollama' ? { baseURL: config.llm.ollamaBaseUrl } : {}),
        // Only add API key for OpenAI
        ...(config.llm.provider === 'openai' ? { apiKey: process.env.OPENAI_API_KEY } : {}),
        temperature: config.llm.temperature || 0.7
      },
      memory: {
        redis: {
          enabled: true,
          url: 'redis://localhost:6379',
          prefix: 'fast-chat:memory:',
          sessionTTL: 24 * 60 * 60
        },
        database: {
          type: 'supabase',
          url: '',
          key: '',
          enabled: false
        },
        defaults: {
          maxContextSize: 4096,
          sessionTTL: 24 * 60 * 60,
          maxMessageSize: 32768
        }
      }
    };

    // Log the provider configuration
    logger.info('Initializing LLM service with provider:', {
      provider: config.llm.provider,
      modelId: config.llm.defaultModel,
      baseURL: config.llm.provider === 'ollama' ? config.llm.ollamaBaseUrl : 'default OpenAI endpoint'
    });

    // Initialize LLM service
    llmService = createLLMService(llmConfig);
    await llmService.initialize();
    logger.info('LLM service initialized successfully');

  } catch (error) {
    logger.error('error initializing services:', error);
    throw error;
  }
}

/**
 * starts the server on the specified port
 */
export async function startServer(server: Server, port: number): Promise<void> {
  try {
    // Initialize services before starting server
    await initializeServices();

    // Start listening
    server.listen(port, () => {
      logger.info(`server started on port ${port}`);
      logger.info(`health check: http://localhost:${port}/health`);
      logger.info(`api: http://localhost:${port}/api/v1`);
    });
  } catch (error) {
    logger.error('error starting server:', error);
    throw error;
  }
}

/**
 * sets up graceful shutdown handlers
 */
export function setupGracefulShutdown(server: Server): void {
  async function cleanup() {
    logger.info('SIGTERM received, starting graceful shutdown');

    try {
      // Close server first (stop accepting new connections)
      server.close();

      // Cleanup services
      if (llmService) {
        await llmService.shutdown();
      }

      process.exit(0);
    } catch (error) {
      logger.error('error during shutdown', error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
} 