/**
 * health check module
 * 
 * verifies required services are running before server startup
 * Note: Database connectivity is not required for this application
 */

import axios from 'axios';
import Redis from 'ioredis';
import logger from '../utils/logger';
import { config } from '../config/index';

interface ServiceCheck {
  name: string;
  check: () => Promise<boolean>;
  required: boolean;
}

/**
 * checks if redis is running and accessible
 */
async function checkRedis(): Promise<boolean> {
  const redis = new Redis('redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // disable retries for quick check
  });

  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('redis health check failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    return false;
  } finally {
    redis.disconnect();
  }
}

/**
 * checks if ollama is running and accessible
 */
async function checkOllama(): Promise<boolean> {
  try {
    const response = await axios.get(`${config.llm.ollamaBaseUrl}/api/tags`, {
      timeout: 2000
    });
    return response.status === 200;
  } catch (error) {
    logger.error('ollama health check failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available',
      url: `${config.llm.ollamaBaseUrl}/api/tags`
    });
    // For development, let's return true even if Ollama is not running
    return config.server.nodeEnv === 'development';
  }
}

/**
 * performs health checks for all required services
 * Note: Database is not checked as it's not required in this application
 */
export async function checkRequiredServices(): Promise<boolean> {
  const services: ServiceCheck[] = [
    { name: 'Redis', check: checkRedis, required: true },
    { name: 'Ollama', check: checkOllama, required: config.server.nodeEnv !== 'development' }
  ];

  let allRequiredServicesUp = true;
  const results = await Promise.all(
    services.map(async (service) => {
      try {
        const isUp = await service.check();
        if (service.required && !isUp) {
          allRequiredServicesUp = false;
        }
        return { name: service.name, isUp, required: service.required };
      } catch (error) {
        logger.error(`Error checking service ${service.name}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace available'
        });
        const isUp = false;
        if (service.required) {
          allRequiredServicesUp = false;
        }
        return { name: service.name, isUp, required: service.required };
      }
    })
  );

  // Log results
  results.forEach(({ name, isUp, required }) => {
    if (isUp) {
      logger.info(`${name} service is running`);
    } else {
      const level = required ? 'error' : 'warn';
      logger[level](`${name} service is not running${required ? ' (required)' : ''}`);
    }
  });

  // In development mode, always return true to allow the server to start
  if (config.server.nodeEnv === 'development') {
    logger.info('Development mode: Starting server regardless of service status');
    return true;
  }

  return allRequiredServicesUp;
} 