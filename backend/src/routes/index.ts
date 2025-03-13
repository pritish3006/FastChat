import express from 'express';
import authRoutes from './auth';
import chatRoutes from './chat';
import modelsRoutes from './models';
import userPreferencesRoutes from './user-preferences';
import workflowsRoutes from './workflows';
import { adminSupabase } from '../services/database/supabase';
import logger from '../utils/logger';
import config from '../config';

const router = express.Router();

// API routes
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/models', modelsRoutes);
router.use('/user/preferences', userPreferencesRoutes);
router.use('/workflows', workflowsRoutes);

// Health check endpoint to verify database connectivity
router.get('/health', async (req, res) => {
  interface DatabaseStatus {
    available: boolean;
    mode: string;
    fallbackEnabled: boolean;
    error?: string;
  }
  
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    services: {
      database: {
        available: true,
        mode: config.database.useDatabase ? 'active' : 'disabled',
        fallbackEnabled: config.database.enableInMemoryFallback
      } as DatabaseStatus,
      server: {
        uptime: process.uptime().toFixed(2) + 's'
      }
    }
  };
  
  // Check database connectivity if database is enabled
  if (config.database.useDatabase) {
    try {
      // Simply ping the database with a quick query
      const { data, error } = await adminSupabase.from('sessions').select('count(*)', { count: 'exact', head: true });
      
      if (error) {
        logger.warn('Database health check failed', { error: error.message, code: error.code });
        response.services.database.available = false;
        response.services.database.error = error.message;
        response.services.database.mode = 'fallback';
      }
    } catch (error) {
      logger.error('Database health check exception', { error: error instanceof Error ? error.message : String(error) });
      response.services.database.available = false;
      response.services.database.error = error instanceof Error ? error.message : 'Unknown error';
      response.services.database.mode = 'fallback';
    }
  }
  
  // Return appropriate status code
  if (!response.services.database.available && config.database.useDatabase) {
    if (config.database.enableInMemoryFallback) {
      // Service is degraded but still functional
      return res.status(200).json(response);
    } else {
      // Service is unhealthy
      return res.status(503).json(response);
    }
  }
  
  // All good
  return res.status(200).json(response);
});

export default router; 