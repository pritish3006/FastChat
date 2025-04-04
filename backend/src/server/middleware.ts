/**
 * server middleware
 * 
 * configures and applies express middleware
 * groups middleware by function for selective application
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import { requestLogger } from '../utils/logger';
import { config } from '../config/index';
import { defaultLimiter } from '../middleware/rateLimiter';

/**
 * applies essential security and request processing middleware
 */
export function applyBaseMiddleware(app: Application): void {
  // Request ID middleware - adds x-request-id to all requests
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    res.setHeader('x-request-id', req.headers['x-request-id'] as string);
    next();
  });
  
  // Security middleware
  app.use(helmet());
  
  // CORS configuration
  app.use(cors({
    origin: config.cors.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }));
}

/**
 * applies performance optimization middleware
 */
export function applyPerformanceMiddleware(app: Application): void {
  // Compression middleware - only for text responses
  app.use(compression({
    filter: (req, res) => {
      // Only compress text responses
      const contentType = res.getHeader('Content-Type');
      return contentType ? /text|json|javascript|css|xml/i.test(contentType.toString()) : false;
    },
    level: 6 // Balanced between compression ratio and speed
  }));
}

/**
 * applies logging middleware appropriate for the environment
 */
export function applyLoggingMiddleware(app: Application): void {
  // Logging middleware - development friendly format in dev, concise in prod
  if (config.server.nodeEnv === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('tiny'));
  }
  
  // Application-specific request logging
  app.use(requestLogger);
}

/**
 * applies middleware for parsing request bodies
 */
export function applyBodyParserMiddleware(app: Application, path: string = '/api'): void {
  // Parse JSON requests
  app.use(path, express.json({ limit: '1mb' }));
  
  // Parse URL-encoded form data
  app.use(path, express.urlencoded({ extended: true, limit: '1mb' }));
}

/**
 * applies rate limiting middleware
 */
export function applyRateLimitingMiddleware(app: Application): void {
  // Global rate limiting
  app.use(defaultLimiter);
}

/**
 * applies all middleware at once
 */
export function applyAllMiddleware(app: Application): void {
  applyBaseMiddleware(app);
  applyPerformanceMiddleware(app);
  applyLoggingMiddleware(app);
  applyBodyParserMiddleware(app);
  applyRateLimitingMiddleware(app);
} 