import express from 'express';
import authRoutes from './auth';
import chatRoutes from './chat';
import modelsRoutes from './models';
// Import missing routes as empty routers
const userPreferencesRoutes = express.Router();
const workflowsRoutes = express.Router();

// Disable database import for now
// import { adminSupabase } from '../services/database/supabase';
import logger from '../utils/logger';
import { config } from '../config';

const router = express.Router();

// API routes
router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/models', modelsRoutes);
router.use('/user/preferences', userPreferencesRoutes);
router.use('/workflows', workflowsRoutes);

// Health check endpoint
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
        available: false,
        mode: 'disabled',
        fallbackEnabled: true
      } as DatabaseStatus,
      server: {
        uptime: process.uptime().toFixed(2) + 's'
      }
    }
  };
  
  // Database check disabled for now
  
  // All good
  return res.status(200).json(response);
});

export default router; 