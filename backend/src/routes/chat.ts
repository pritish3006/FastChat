import { Router } from 'express';
import { sendMessage, getModels, stopGeneration } from '../controllers/chatController';

const router = Router();

// Route to send a message and get a streaming response
router.post('/message', sendMessage);

// Route to get available models
router.get('/models', getModels);

// Route to stop an in-progress generation
router.post('/stop', stopGeneration);

export default router; 