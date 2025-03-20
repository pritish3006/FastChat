/**
 * server routes
 * 
 * registers api routes and endpoints
 * provides versioning and organization of routes
 */

import express, { Application } from 'express';
import logger from '../utils/logger';
import apiRoutes from '../routes/index';

/**
 * registers all route handlers on the express app
 */
export function registerAllRoutes(app: Application): void {
  try {
    logger.info('Registering all routes...');
    
    // Mounting the main API router
    try {
      logger.info('Mounting API routes...');
      app.use('/api/v1', apiRoutes);
      logger.info('API routes mounted successfully');
    } catch (error) {
      logger.error('Failed to mount API routes:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    // Basic health check endpoint directly on app for simplicity
    try {
      logger.info('Registering basic health check endpoint...');
      app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
      });
      logger.info('Basic health check endpoint registered successfully');
    } catch (error) {
      logger.error('Failed to register basic health check endpoint:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    // Root endpoint with basic info
    try {
      logger.info('Registering root endpoint...');
      app.get('/', (req, res) => {
        res.status(200).json({ 
          service: 'fast-chat-api',
          version: '1.0.0',
          message: 'Welcome to Fast Chat API'
        });
      });
      logger.info('Root endpoint registered successfully');
    } catch (error) {
      logger.error('Failed to register root endpoint:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    // 404 handler for undefined routes
    try {
      logger.info('Registering 404 handler...');
      app.use((req, res) => {
        res.status(404).json({ 
          status: 'error',
          message: `Route not found: ${req.method} ${req.path}`
        });
      });
      logger.info('404 handler registered successfully');
    } catch (error) {
      logger.error('Failed to register 404 handler:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      throw error;
    }
    
    logger.info('All routes registered successfully');
  } catch (error) {
    logger.error('Failed to register routes:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace available'
    });
    // Rethrow so the caller knows something went wrong
    throw error;
  }
} 