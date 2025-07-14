/**
 * config module
 * 
 * centralizes all configuration variables and app settings.
 * loads from environment variables with validation and defaults.
 */

import dotenv from 'dotenv';
import { z } from 'zod';
import logger from '../utils/logger';

// load environment variables
dotenv.config();

// configuration schema
const configSchema = z.object({
  server: z.object({
    port: z.coerce.number().default(3000),
    nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
    host: z.string().default('localhost'),
  }),
  cors: z.object({
    allowedOrigins: z.array(z.string()).default(['http://localhost:3000'])
  }),
  llm: z.object({
    provider: z.enum(['ollama', 'openai']).default('openai'),
    defaultModel: z.string().default('gpt-3.5-turbo'),
    ollamaBaseUrl: z.string().default('http://localhost:11434'),
    openaiApiKey: z.string().optional(),
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).default(0.9),
    maxTokens: z.number().min(1).default(1000)
  }),
  database: z.object({
    useDatabase: z.boolean().default(false),
    enableInMemoryFallback: z.boolean().default(true)
  }),
  redis: z.object({
    enabled: z.boolean().default(true),
    url: z.string().default('redis://localhost:6379'),
    prefix: z.string().default('fast-chat:memory:'),
    sessionTTL: z.number().default(24 * 60 * 60) // 24 hours in seconds
  })
});

// Critical fields that must be present in production
const CRITICAL_FIELDS = [
  'llm.provider',
  'llm.defaultModel',
  process.env.NODE_ENV === 'production' ? 'llm.openaiApiKey' : null
].filter(Boolean);

// parse and validate config
export const config = parseConfig();

function parseConfig() {
  try {
    return configSchema.parse({
      server: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        host: process.env.HOST || 'localhost'
      },
      cors: {
        allowedOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',')
      },
      llm: {
        provider: process.env.LLM_PROVIDER || 'openai',
        defaultModel: process.env.DEFAULT_MODEL || 'gpt-3.5-turbo',
        ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        openaiApiKey: process.env.OPENAI_API_KEY,
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
        topP: parseFloat(process.env.LLM_TOP_P || '0.9'),
        maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1000', 10)
      },
      database: {
        useDatabase: false, // Explicitly set to false regardless of env variable
        enableInMemoryFallback: true
      },
      redis: {
        enabled: process.env.REDIS_ENABLED !== 'false',
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        prefix: process.env.REDIS_PREFIX || 'fast-chat:memory:',
        sessionTTL: parseInt(process.env.REDIS_SESSION_TTL || String(24 * 60 * 60), 10)
      }
    });
  } catch (error: any) {
    // Handle validation errors
    logger.error('Configuration validation error:', error);
    process.exit(1);
  }
} 