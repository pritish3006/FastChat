import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { DeepgramService, STTOptions, TTSOptions } from '../services/voice/deepgram';

const router = Router();
const voiceService = new DeepgramService();

// Configure multer for handling audio file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Apply optional auth to all voice routes
router.use(optionalAuth);

// Speech-to-text endpoint
router.post('/transcribe', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new ApiError(400, 'Audio file is required');
    }

    const options: STTOptions = {
      language: req.body.language || 'en-US',
      model: req.body.model || 'nova-2',
      punctuate: req.body.punctuate !== 'false',
      profanityFilter: req.body.profanityFilter === 'true',
      diarize: req.body.diarize === 'true'
    };

    const transcript = await voiceService.speechToText(req.file.buffer, options);

    res.json({
      success: true,
      transcript
    });
  } catch (error) {
    logger.error('Speech-to-text request failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Speech-to-text request failed'));
  }
});

// Text-to-speech endpoint
router.post('/synthesize', async (req, res, next) => {
  try {
    const { text, options } = req.body;

    if (!text || typeof text !== 'string') {
      throw new ApiError(400, 'Text is required and must be a string');
    }

    const ttsOptions: TTSOptions = {
      voice: options?.voice || 'nova',
      model: options?.model || 'nova-2',
      speed: options?.speed || 1.0,
      pitch: options?.pitch || 1.0
    };

    const audioBuffer = await voiceService.textToSpeech(text, ttsOptions);

    // Set appropriate headers for audio file download
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Disposition': 'attachment; filename="speech.wav"'
    });

    res.send(audioBuffer);
  } catch (error) {
    logger.error('Text-to-speech request failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Text-to-speech request failed'));
  }
});

export default router; 