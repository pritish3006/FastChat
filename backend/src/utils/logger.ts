/**
 * application logger
 * 
 * high-performance structured logging using pino
 * configures output based on environment
 * provides consistent logging interface across the application
 */

import pino from 'pino';
import { Request, Response, NextFunction } from 'express';

// Add this type declaration at the top of the file
declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      email?: string;
      [key: string]: any;
    };
  }
}

// base log configuration
const baseConfig = {
  timestamp: true,
  // don't stringify Error instances so we preserve stack traces
  serializers: {
    err: pino.stdSerializers.err,
  }
};

// define valid environment types
type Environment = 'development' | 'test' | 'production';

// environment-specific configurations
const configs: Record<Environment, any> = {
  // pretty printing for development
  development: {
    ...baseConfig,
    level: 'debug',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  },
  
  // json logs for test but with minimal output
  test: {
    ...baseConfig,
    level: 'error', // only log errors in tests
    enabled: false, // disable in test by default, can override
  },
  
  // optimized for production
  production: {
    ...baseConfig,
    level: 'info',
    // in production, output raw JSON for log aggregators
    // no transport configuration needed - maximum performance
  },
};

// detect environment with type assertion
const env = (process.env.NODE_ENV || 'development') as Environment;
const config = configs[env] || configs.development;

// create the logger instance
export const logger = pino(config);

// request context logger middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // When response finishes
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Only log if not a health check or static asset
    if (!req.path.includes('/health') && !req.path.includes('/static')) {
      logger.info({
        type: 'request',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        requestId: req.headers['x-request-id'],
        // limit user info to avoid PII issues
        userId: (req as any).user?.id || 'anonymous',
      }, 'request completed');
    }
  });
  
  next();
};

// convenience methods with consistent formatting
export const logError = (err: Error | string, context: Record<string, any> = {}) => {
  if (typeof err === 'string') {
    // If a string is provided, create an Error object from it
    const error = new Error(err);
    logger.error({ err: error, ...context }, err);
  } else {
    // If an Error object is provided, use it directly
    logger.error({ err, ...context }, err.message);
  }
};

export const logWarning = (message: string, context: Record<string, any> = {}) => {
  logger.warn(context, message);
};

export const logInfo = (message: string, context: Record<string, any> = {}) => {
  logger.info(context, message);
};

export const logDebug = (message: string, context: Record<string, any> = {}) => {
  logger.debug(context, message);
};

// Add a default export for the logger at the end of the file
export default logger;