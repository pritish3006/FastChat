/**
 * server routes
 * 
 * registers api routes and endpoints
 * provides versioning and organization of routes
 */

import { Application, Request, Response, Router, NextFunction } from 'express';
import { config } from '../config/index';

/**
 * registers the health check endpoint
 */
export function registerHealthEndpoint(app: Application): void {
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      environment: config.server.nodeEnv,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || 'unknown'
    });
  });
}

/**
 * registers the main api routes
 */
export function registerApiRoutes(app: Application): void {
  // Import routes
  const chatRoutes = require('../routes/chat').default;
  const authRoutes = require('../routes/auth').default;
  const modelsRoutes = require('../routes/models').default;
  
  // create API router
  const apiRouter = Router();
  
  // register API routes
  apiRouter.use('/chat', chatRoutes);
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/models', modelsRoutes);
  
  // apply API router with version prefix
  app.use('/api/v1', apiRouter);
  
  // redirect root API to v1
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/') {
      return res.redirect('/api/v1');
    }
    next();
  });
}

/**
 * registers error handling routes (404 handler, etc.)
 */
export function registerErrorRoutes(app: Application): void {
  // 404 handler for undefined routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    (error as any).statusCode = 404;
    next(error);
  });
}

/**
 * registers all routes at once
 */
export function registerAllRoutes(app: Application): void {
  registerHealthEndpoint(app);
  registerApiRoutes(app);
  registerErrorRoutes(app);
} 