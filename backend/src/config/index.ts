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

// define critical configuration fields that must be present
const CRITICAL_FIELDS = ['SUPABASE_URL', 'SUPABASE_KEY'];

// define config schema with zod for validation
const configSchema = z.object({
  // server config
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  
  // cors config
  CORS_ALLOWED_ORIGINS: z.string().default(process.env.FRONTEND_URL || 'http://localhost:5173'),
  
  // supabase config
  SUPABASE_URL: z.string().url(),
  SUPABASE_KEY: z.string().min(1),
  
  // llm providers config
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'ollama']).default('ollama'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  DEFAULT_MODEL: z.string().default('llama3'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  
  // security config
  JWT_SECRET: z.string().min(32).default('supersecretkeyyoushouldnotcommittogithub'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('60'),  // 60 requests per minute
});

// helper function to parse and validate config
function parseConfig() {
  try {
    // parse raw env variables using the schema
    const rawConfig = configSchema.parse(process.env);
    
    // create the structured config object
    return {
      // raw env variables
      ...rawConfig,
      
      // environment helpers
      environment: rawConfig.NODE_ENV,
      isDev: rawConfig.NODE_ENV === 'development',
      isTest: rawConfig.NODE_ENV === 'test',
      isProd: rawConfig.NODE_ENV === 'production',
      
      // nested structure for organized access
      server: {
        port: rawConfig.PORT,
        nodeEnv: rawConfig.NODE_ENV,
        frontendUrl: rawConfig.FRONTEND_URL,
      },
      
      cors: {
        allowedOrigins: rawConfig.CORS_ALLOWED_ORIGINS.split(','),
      },
      
      rateLimit: {
        max: rawConfig.RATE_LIMIT_MAX_REQUESTS,
        windowMs: rawConfig.RATE_LIMIT_WINDOW_MS,
      },
      
      database: {
        supabaseUrl: rawConfig.SUPABASE_URL,
        supabaseKey: rawConfig.SUPABASE_KEY,
      },
      
      llm: {
        provider: rawConfig.LLM_PROVIDER,
        defaultModel: rawConfig.DEFAULT_MODEL,
        openaiApiKey: rawConfig.OPENAI_API_KEY,
        anthropicApiKey: rawConfig.ANTHROPIC_API_KEY,
        ollamaBaseUrl: rawConfig.OLLAMA_BASE_URL,
      },
      
      security: {
        jwtSecret: rawConfig.JWT_SECRET,
        jwtExpiresIn: rawConfig.JWT_EXPIRES_IN,
      }
    };
  } catch (error: any) {
    // log the validation errors
    logger.error('validation error', { errors: error.errors });
    
    // in development, provide more friendly errors
    if (process.env.NODE_ENV !== 'production') {
      console.error('⚠️ invalid environment variables:');
      
      // Track missing fields for validation warnings
      const missingFields: string[] = [];
      const criticalMissing: string[] = [];
      
      error.errors.forEach((err: any) => {
        const fieldName = err.path.join('.');
        console.error(`- ${fieldName}: ${err.message}`);
        
        missingFields.push(fieldName);
        if (CRITICAL_FIELDS.includes(fieldName)) {
          criticalMissing.push(fieldName);
        }
      });
      
      console.error('\nplease check your .env file and update accordingly.');
      
      // Show warning about using fallbacks
      if (missingFields.length > 0) {
        const nonCriticalMissing = missingFields.filter(
          field => !CRITICAL_FIELDS.includes(field)
        );
        
        if (nonCriticalMissing.length > 0) {
          console.warn('\n⚠️ using fallback values for:');
          nonCriticalMissing.forEach(field => {
            console.warn(`- ${field}`);
          });
        }
      }
    }
    
    // exit if in production or critical fields are missing
    const hasCriticalErrors = error.errors.some((e: any) => 
      CRITICAL_FIELDS.includes(e.path[0])
    );
    
    if (process.env.NODE_ENV === 'production' || hasCriticalErrors) {
      if (hasCriticalErrors) {
        console.error('\n❌ missing critical configuration:');
        error.errors
          .filter((e: any) => CRITICAL_FIELDS.includes(e.path[0]))
          .forEach((e: any) => {
            console.error(`- ${e.path.join('.')}: ${e.message}`);
          });
        console.error('\nthe application cannot start without these values.');
      }
      process.exit(1);
    }
    
    // return partial config for development to allow startup
    const partialConfig = configSchema.partial().parse(process.env);
    
    // create a partial structured config with enhanced fallbacks
    const config = {
      ...partialConfig,
      server: {
        port: partialConfig.PORT || 3001,
        nodeEnv: partialConfig.NODE_ENV || 'development',
        frontendUrl: partialConfig.FRONTEND_URL || 'http://localhost:5173',
      },
      cors: {
        allowedOrigins: (partialConfig.CORS_ALLOWED_ORIGINS || 'http://localhost:5173').split(','),
      },
      rateLimit: {
        max: partialConfig.RATE_LIMIT_MAX_REQUESTS || 60,
        windowMs: partialConfig.RATE_LIMIT_WINDOW_MS || 60000,
      },
      database: {
        supabaseUrl: partialConfig.SUPABASE_URL,
        supabaseKey: partialConfig.SUPABASE_KEY,
      },
      llm: {
        provider: partialConfig.LLM_PROVIDER || 'ollama',
        defaultModel: partialConfig.DEFAULT_MODEL || 'llama3',
        openaiApiKey: partialConfig.OPENAI_API_KEY,
        anthropicApiKey: partialConfig.ANTHROPIC_API_KEY,
        ollamaBaseUrl: partialConfig.OLLAMA_BASE_URL || 'http://localhost:11434',
      },
      security: {
        jwtSecret: partialConfig.JWT_SECRET || 'development_jwt_secret_not_secure',
        jwtExpiresIn: partialConfig.JWT_EXPIRES_IN || '7d',
      }
    };

    // Log warnings about default fallbacks being used
    if (process.env.NODE_ENV !== 'production' && !partialConfig.OLLAMA_BASE_URL) {
      console.warn('⚠️ no LLM provider configured, using local Ollama at http://localhost:11434');
      console.warn('   if Ollama is not running, LLM requests will fail');
    }
    
    if (process.env.NODE_ENV !== 'production' && 
        partialConfig.JWT_SECRET === 'development_jwt_secret_not_secure') {
      console.warn('⚠️ using insecure JWT secret - do not use in production!');
    }
    
    return config;
  }
}

// Export validated config
const config = parseConfig();
export { config };
export default config; 