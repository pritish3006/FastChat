import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { DeepgramService, STTOptions, TTSOptions } from '../services/voice/deepgram';

/**
 * @swagger
 * tags:
 *   name: Voice
 *   description: Voice processing APIs for speech-to-text and text-to-speech
 */

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

/**
 * @swagger
 * /api/v1/agent/voice/transcribe:
 *   post:
 *     summary: Transcribe audio to text
 *     description: |
 *       Convert uploaded audio file to text using speech recognition via the VoiceAgent. 
 *       This endpoint provides direct access to the Speech-to-Text functionality used by the VoiceAgent 
 *       in the agent workflow system.
 *       
 *       Uses Deepgram's speech recognition API for high-quality transcription with support
 *       for multiple languages and specialized models.
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - audio
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file to transcribe (max 10MB)
 *               language:
 *                 type: string
 *                 description: Language code (e.g., en-US, fr, de)
 *                 default: en-US
 *               model:
 *                 type: string
 *                 description: Transcription model to use
 *                 enum: [nova-2, enhanced, base]
 *                 default: nova-2
 *               punctuate:
 *                 type: boolean
 *                 description: Whether to add punctuation
 *                 default: true
 *               profanityFilter:
 *                 type: boolean
 *                 description: Whether to filter profanity
 *                 default: false
 *               diarize:
 *                 type: boolean
 *                 description: Whether to identify different speakers
 *                 default: false
 *     responses:
 *       200:
 *         description: Successful transcription
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether the transcription was successful
 *                 transcript:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                       description: Transcribed text
 *                     confidence:
 *                       type: number
 *                       description: Confidence score (0-1)
 *                     words:
 *                       type: array
 *                       description: Individual word timestamps and confidence scores
 *                       items:
 *                         type: object
 *                         properties:
 *                           word:
 *                             type: string
 *                             description: Transcribed word
 *                           start:
 *                             type: number
 *                             description: Start time in seconds
 *                           end:
 *                             type: number
 *                             description: End time in seconds
 *                           confidence:
 *                             type: number
 *                             description: Word-level confidence score (0-1)
 *       400:
 *         description: Missing audio file or invalid parameters
 *       500:
 *         description: Speech-to-text service error
 */
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

/**
 * @swagger
 * /api/v1/agent/voice/synthesize:
 *   post:
 *     summary: Synthesize text to speech
 *     description: |
 *       Convert text to spoken audio using text-to-speech via the SpeechAgent.
 *       This endpoint provides direct access to the Text-to-Speech functionality used by 
 *       the SpeechAgent in the agent workflow system.
 *       
 *       Uses Deepgram's voice synthesis API to generate natural-sounding speech with
 *       customizable voice, speed, and pitch settings.
 *     tags: [Voice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Text to convert to speech
 *               options:
 *                 type: object
 *                 description: Voice synthesis options
 *                 properties:
 *                   voice:
 *                     type: string
 *                     description: Voice ID to use
 *                     enum: [nova, aura, stella, midnight]
 *                     default: nova
 *                   model:
 *                     type: string
 *                     description: TTS model to use
 *                     enum: [nova-2, enhanced]
 *                     default: nova-2
 *                   speed:
 *                     type: number
 *                     description: Speech speed multiplier (0.5-2.0)
 *                     default: 1.0
 *                   pitch:
 *                     type: number
 *                     description: Voice pitch adjustment (0.5-2.0)
 *                     default: 1.0
 *     responses:
 *       200:
 *         description: Audio file with synthesized speech
 *         content:
 *           audio/wav:
 *             schema:
 *               type: string
 *               format: binary
 *               description: WAV audio file containing the synthesized speech
 *       400:
 *         description: Missing text or invalid parameters
 *       500:
 *         description: Text-to-speech service error
 */
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