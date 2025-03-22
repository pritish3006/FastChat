import { Router } from 'express';
import { optionalAuth } from '../middleware/authMiddleware';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { WorkflowFactory } from '../services/agents/graph/workflow-factory';
import { config } from '../config';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { SummaryAgent } from '../services/agents/summary-agent';
import multer from 'multer';

/**
 * @swagger
 * tags:
 *   name: Agent
 *   description: Advanced agent workflows for chat, search, and voice synthesis
 * 
 * components:
 *   schemas:
 *     Agent:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The name of the agent
 *         description:
 *           type: string
 *           description: Description of the agent's purpose
 *         model:
 *           type: string
 *           description: The LLM model used by the agent
 *         enabled:
 *           type: boolean
 *           description: Whether the agent is enabled in the current workflow
 *     
 *     VoiceAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Handles Speech-to-Text (STT) transcription
 *             inputType:
 *               type: string
 *               enum: [audio, voiceText]
 *               description: Type of input the agent can process
 *     
 *     SpeechAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Handles Text-to-Speech (TTS) synthesis
 *             outputType:
 *               type: string
 *               enum: [audio]
 *               description: Type of output the agent produces
 *
 *     QueryAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Analyzes user queries to determine required tools and actions
 *             outputType:
 *               type: string
 *               enum: [queryAnalysis]
 *               description: Type of output the agent produces
 *     
 *     ResponseAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Generates final text responses for the user
 *             dependencies:
 *               type: array
 *               items:
 *                 type: string
 *               description: List of agents that can provide input to this agent
 *
 *     SearchAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Performs web searches to gather information
 *             provider:
 *               type: string
 *               enum: [tavily]
 *               description: The search provider used by the agent
 *     
 *     SummaryAgent:
 *       allOf:
 *         - $ref: '#/components/schemas/Agent'
 *         - type: object
 *           properties:
 *             purpose:
 *               type: string
 *               description: Creates summaries of conversations, search results, or voice transcripts
 *             supportedModes:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [search, chat, voice]
 *               description: The types of content this agent can summarize
 */

const router = Router();

// Configure multer for handling audio file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Debug logging
logger.info('Initializing agent router');

// Apply optional auth to all agent routes
router.use(optionalAuth);

// Store conversation history (simple in-memory storage for now)
// In production, this should use Redis or a database
const conversationStore = new Map<string, {
  history: ChatCompletionMessageParam[];
  lastUpdated: Date;
}>();

// Debug logging
logger.info('Registering agent query endpoint');

/**
 * @swagger
 * /api/v1/agent/voice:
 *   post:
 *     summary: End-to-end voice processing
 *     description: |
 *       Process audio input through the VoiceAgent (STT), analyze the query with QueryAgent,
 *       generate a response with ResponseAgent, and return an audio response via SpeechAgent (TTS).
 *       This endpoint orchestrates a complex workflow involving multiple specialized agents.
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *                 description: Audio file to transcribe (optional if voiceText is provided)
 *               voiceText:
 *                 type: string
 *                 description: Text to process as voice input (optional if audio is provided)
 *               conversationId:
 *                 type: string
 *                 description: ID for continuing an existing conversation
 *               voiceOptions:
 *                 type: string
 *                 description: |
 *                   JSON string of voice options:
 *                   ```json
 *                   {
 *                     "voice": "nova", // Voice ID to use
 *                     "model": "nova-2", // Model for STT/TTS
 *                     "speed": 1.0, // Speech rate multiplier
 *                     "pitch": 1.0 // Voice pitch adjustment
 *                   }
 *                   ```
 *     responses:
 *       200:
 *         description: Voice processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether the request was successful
 *                 conversationId:
 *                   type: string
 *                   description: Unique ID for this conversation session
 *                 audio:
 *                   type: string
 *                   description: Base64 encoded audio response
 *                 transcription:
 *                   type: string
 *                   description: Transcription of the input audio
 *                 response:
 *                   type: string
 *                   description: Text response that was converted to audio
 *                 processingTime:
 *                   type: number
 *                   description: Total processing time in seconds
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error or agent workflow failure
 */
router.post('/voice', upload.single('audio'), async (req, res, next) => {
  try {
    const startTime = new Date().getTime();
    logger.info('[VOICE] Received voice request');
    
    // Get audio file or voice text
    const audioFile = req.file;
    const voiceText = req.body.voiceText;
    let voiceOptions = {};
    
    // Parse voice options if provided
    try {
      if (req.body.voiceOptions) {
        voiceOptions = JSON.parse(req.body.voiceOptions);
      }
    } catch (e) {
      logger.warn('[VOICE] Invalid voiceOptions JSON', { error: e });
    }
    
    if (!audioFile && !voiceText) {
      return res.status(400).json({
        success: false,
        error: 'Either audio file or voiceText must be provided'
      });
    }
    
    // Prepare audio buffer if file was uploaded
    let audioBuffer: Buffer | undefined;
    if (audioFile) {
      audioBuffer = audioFile.buffer;
      logger.info(`[VOICE] Audio file received: ${audioFile.originalname}, ${audioFile.size} bytes`);
    } else if (voiceText) {
      logger.info(`[VOICE] Voice text received: "${voiceText}"`);
    }
    
    // Get or create conversation
    const conversationId = req.body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    let history: ChatCompletionMessageParam[] = [];
    
    if (conversationId && conversationStore.has(conversationId)) {
      logger.info(`[VOICE] Continuing conversation: ${conversationId}`);
      history = conversationStore.get(conversationId)?.history || [];
    } else {
      logger.info(`[VOICE] Starting new conversation: ${conversationId}`);
    }
    
    // Create context for voice workflow
    const context = {
      message: voiceText || 'Process this audio input',
      history,
      config: {
        apiKey: config.llm.apiKey || '',
        searchApiKey: config.search?.tavilyApiKey || 'dummy-key',
        voiceApiKey: config.voice?.ttsApiKey || ''
      },
      flags: {
        workflowType: 'voice' as 'voice',
        needsVoice: true,
        voiceText,
        voiceOptions
      },
      audioInput: audioBuffer,
      intermediateSteps: [],
      toolResults: {}
    };
    
    // Create workflow event handlers
    const workflowEvents = {
      onToolStart: (tool) => {
        logger.info(`[VOICE] Tool execution started: ${tool}`);
      },
      onToolEnd: (tool, result) => {
        logger.info(`[VOICE] Tool execution completed: ${tool}`);
      },
      onComplete: (result) => {
        logger.info('[VOICE] Workflow completed', { 
          hasResponse: !!result.context.toolResults.response,
          hasVoice: !!result.context.toolResults.voice,
          hasSpeech: !!result.context.toolResults.speech
        });
      }
    };
    
    // Create and execute workflow
    const workflow = WorkflowFactory.createVoiceWorkflow(context, workflowEvents);
    const result = await workflow.execute('voice');
    
    // Calculate processing time
    const endTime = new Date().getTime();
    const processingTime = (endTime - startTime) / 1000;
    logger.info(`[VOICE] Processing completed in ${processingTime}s`);
    
    // Extract results
    const audio = result.context.toolResults.speech?.audio;
    const transcription = result.context.toolResults.voice?.text || voiceText;
    const responseText = result.context.toolResults.response;
    
    // Update conversation history
    if (responseText) {
      const updatedHistory = [...history];
      
      // Add user's message
      if (transcription) {
        updatedHistory.push({
          role: 'user',
          content: transcription
        });
      }
      
      // Add system's response
      updatedHistory.push({
        role: 'assistant',
        content: responseText
      });
      
      // Store updated history
      conversationStore.set(conversationId, {
        history: updatedHistory,
        lastUpdated: new Date()
      });
      
      // Prune old conversations (keep for 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      for (const [id, conversation] of conversationStore.entries()) {
        if (conversation.lastUpdated < oneDayAgo) {
          conversationStore.delete(id);
          logger.debug(`[VOICE] Pruned old conversation: ${id}`);
        }
      }
    }
    
    // Check if we have audio output
    if (!audio) {
      return res.status(500).json({
        success: false,
        conversationId,
        error: 'Failed to generate audio response',
        transcription,
        response: responseText
      });
    }
    
    // Return successful response
    return res.status(200).json({
      success: true,
      conversationId,
      audio,
      transcription,
      response: responseText,
      processingTime
    });
    
  } catch (error) {
    logger.error('[VOICE] Error processing voice request', { 
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Voice processing failed'));
  }
});

/**
 * @swagger
 * /api/v1/agent/query:
 *   post:
 *     summary: Process a query through an agent workflow
 *     description: |
 *       Process a user message through a dynamically configured workflow of specialized agents:
 *       - QueryAgent: Analyzes the query to determine intent and requirements
 *       - SearchAgent: Performs web searches when factual information is needed
 *       - VoiceAgent: Handles voice transcription when voice input is provided
 *       - SummaryAgent: Generates concise summaries of content when requested
 *       - ResponseAgent: Formulates the final text response to the user
 *       - SpeechAgent: Converts text responses to speech when voice output is required
 *       
 *       The workflow execution is adaptive based on query requirements and specified flags.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to process
 *               history:
 *                 type: array
 *                 description: Previous messages in the conversation
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant, system]
 *                     content:
 *                       type: string
 *               flags:
 *                 type: object
 *                 description: Workflow control flags
 *                 properties:
 *                   needsSearch:
 *                     type: boolean
 *                     description: Whether to include web search in the workflow
 *                   needsSummary:
 *                     type: boolean
 *                     description: Whether to generate a summary
 *                   summaryMode:
 *                     type: string
 *                     enum: [search, chat, voice]
 *                     description: Type of summary to generate
 *                   needsVoice:
 *                     type: boolean
 *                     description: Whether to include voice synthesis
 *                   voiceText:
 *                     type: string
 *                     description: Text to synthesize (defaults to message if not provided)
 *                   workflowType:
 *                     type: string
 *                     enum: [chat, voice, search]
 *                     description: Specifies which specialized workflow to use
 *                   voiceOptions:
 *                     type: object
 *                     description: Options for voice processing
 *                     properties:
 *                       voice:
 *                         type: string
 *                         description: Voice ID to use
 *                       model:
 *                         type: string
 *                         description: Model for STT/TTS
 *                       speed:
 *                         type: number
 *                         description: Speech rate multiplier
 *                       pitch:
 *                         type: number
 *                         description: Voice pitch adjustment
 *     responses:
 *       200:
 *         description: Agent workflow results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether the workflow executed successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The agent's response text
 *                     summary:
 *                       type: string
 *                       description: Generated summary (if requested)
 *                     search:
 *                       type: array
 *                       description: Search results (if search was performed)
 *                       items:
 *                         type: object
 *                     steps:
 *                       type: array
 *                       description: Intermediate steps in the workflow
 *                       items:
 *                         type: object
 *                         properties:
 *                           agent:
 *                             type: string
 *                             description: The agent that performed this step
 *                           status:
 *                             type: string
 *                             enum: [success, error, skipped]
 *                             description: The outcome of this step
 *                           details:
 *                             type: object
 *                             description: Additional details about this step
 *                     voice:
 *                       type: object
 *                       description: Voice synthesis result (if requested)
 *                       properties:
 *                         audio:
 *                           type: string
 *                           description: Base64-encoded audio data
 *                         format:
 *                           type: string
 *                           description: "Audio format (default: wav)"
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error or workflow execution failure
 */
router.post('/query', async (req, res, next) => {
  logger.info('Received agent query request', { 
    message: req.body.message,
    hasHistory: !!req.body.history?.length,
    flags: req.body.flags
  });
  
  try {
    const { message, history = [], flags = {} } = req.body;

    if (!message || typeof message !== 'string') {
      throw new ApiError(400, 'Message is required and must be a string');
    }

    // Validate flags if present
    if (flags.needsSummary && flags.summaryMode) {
      if (!['search', 'chat', 'voice'].includes(flags.summaryMode)) {
        throw new ApiError(400, 'Invalid summary mode. Must be one of: search, chat, voice');
      }
    }

    // Create initial context
    const context = {
      message,
      history: history as ChatCompletionMessageParam[],
      intermediateSteps: [],
      toolResults: {
        queryAnalysis: undefined as any,
        search: undefined,
        summary: undefined,
        voice: undefined,
        response: undefined
      },
      flags,
      config: {
        apiKey: config.llm.apiKey || '',
        searchApiKey: config.search?.tavilyApiKey || 'dummy-key',
        voiceApiKey: config.voice?.ttsApiKey || ''
      }
    };

    // For voice requests, add voice text to the context
    if (flags.needsVoice) {
      // Extract or use whole message as voice text
      const voiceText = flags.voiceText || message;
      
      // Create a basic queryAnalysis in the toolResults
      context.toolResults.queryAnalysis = {
        needsSearch: !!flags.needsSearch,
        needsVoice: true,
        voiceText: voiceText
      };
      
      logger.debug('Added voice text to context', { 
        textLength: voiceText.length 
      });
    }

    // Define workflow event handlers
    const workflowEvents = {
      onToken: (token) => {
        logger.debug('Token received', { token });
      },
      onToolStart: (tool) => {
        logger.info('Tool execution started', { tool });
      },
      onToolEnd: (tool, result) => {
        logger.info('Tool execution completed', { tool });
      },
      onComplete: (result) => {
        logger.info('Workflow completed', { 
          hasResponse: !!result.context.toolResults.response,
          hasSummary: !!result.context.toolResults.summary,
          hasSearch: !!result.context.toolResults.search?.length,
          hasVoice: !!result.context.toolResults.voice
        });
      }
    };

    // Determine which specialized workflow to use based on flags
    let workflow;
    let startNode = 'query'; // Default to query as the starting point

    // Check if a specific workflow type was requested
    const workflowType = flags.workflowType || determineWorkflowType(flags);
    
    logger.info(`Creating ${workflowType} workflow`, {
      needsSearch: flags.needsSearch,
      needsSummary: flags.needsSummary,
      needsVoice: flags.needsVoice,
      summaryMode: flags.summaryMode
    });

    // Select the appropriate workflow
    switch (workflowType) {
      case 'voice':
        workflow = WorkflowFactory.createVoiceWorkflow(context, workflowEvents);
        break;
      case 'search':
        workflow = WorkflowFactory.createSearchWorkflow(context, workflowEvents);
        break;
      case 'chat':
      default:
        workflow = WorkflowFactory.createChatWorkflow(context, workflowEvents);
        break;
    }

    logger.debug(`Starting workflow execution with "${startNode}" as the start node`);
    const result = await workflow.execute(startNode);

    logger.info('Workflow execution completed', {
      steps: result.context.intermediateSteps.length,
      hasResponse: !!result.context.toolResults.response,
      hasSummary: !!result.context.toolResults.summary,
      hasSearch: !!result.context.toolResults.search?.length,
      hasVoice: !!result.context.toolResults.voice?.audio
    });

    // Prepare the response object
    const responseObj: {
      success: boolean;
      result: {
        response: string;
        summary?: string;
        search?: any[];
        steps: any[];
        voice?: {
          audio?: string;
          format?: string;
        };
      };
    } = {
      success: true,
      result: {
        response: result.context.toolResults.response || '',
        summary: result.context.toolResults.summary,
        search: result.context.toolResults.search,
        steps: result.context.intermediateSteps
      }
    };

    // Add voice data if available
    if (result.context.toolResults.voice?.audio) {
      responseObj.result.voice = {
        audio: result.context.toolResults.voice.audio,
        format: (result.context.toolResults.voice as any).format || 'wav'
      };
      logger.debug('Including voice audio in response', {
        audioSize: result.context.toolResults.voice.audio.length
      });
    }

    res.json(responseObj);
  } catch (error) {
    logger.error('Agent query failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Agent query failed'));
  }
});

/**
 * Helper function to determine the most appropriate workflow type based on flags
 * @param flags - The request flags
 * @returns The workflow type to use
 */
function determineWorkflowType(flags: any): 'chat' | 'voice' | 'search' {
  if (flags.needsVoice) {
    return 'voice';
  } else if (flags.needsSearch) {
    return 'search';
  } else {
    return 'chat';
  }
}

/**
 * @swagger
 * /api/v1/agent/summary:
 *   post:
 *     summary: Generate a summary of provided content
 *     description: |
 *       Uses the SummaryAgent to create a concise summary of different types of content:
 *       - Chat conversations: Summarizes the key points of a conversation history
 *       - Search results: Extracts and synthesizes the most relevant information from search results
 *       - Voice transcripts: Creates a summary of transcribed voice content
 *       
 *       The summary generation process adapts to the type of content being summarized.
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - mode
 *             properties:
 *               content:
 *                 type: object
 *                 description: |
 *                   The content to summarize, format depends on mode:
 *                   - search: Array of search results
 *                   - chat: Array of conversation messages
 *                   - voice: String of transcribed speech
 *               mode:
 *                 type: string
 *                 enum: [search, chat, voice]
 *                 description: Type of content being summarized
 *     responses:
 *       200:
 *         description: Summary generation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether the summary was generated successfully
 *                 summary:
 *                   type: string
 *                   description: The generated summary
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error or summary generation failure
 */
router.post('/summary', optionalAuth, async (req, res, next) => {
  logger.info('Received summary request', { mode: req.body.mode });
  
  try {
    const { content, mode } = req.body;

    if (!content) {
      throw new ApiError(400, 'Content is required for summarization');
    }

    if (!mode || !['search', 'chat', 'voice'].includes(mode)) {
      throw new ApiError(400, 'Valid mode is required (search, chat, or voice)');
    }

    // Create initial context with appropriate structure based on mode
    const context: any = {
      flags: { needsSummary: true, summaryMode: mode },
      toolResults: {},
      intermediateSteps: []
    };

    // Structure content differently based on mode
    switch (mode) {
      case 'search':
        context.toolResults.search = Array.isArray(content) ? content : [content];
        break;
      case 'chat':
        context.history = Array.isArray(content) ? content : [content];
        break;
      case 'voice':
        context.toolResults.voice = { text: typeof content === 'string' ? content : JSON.stringify(content) };
        break;
    }

    // Create and use SummaryAgent directly
    const summaryAgent = new SummaryAgent({
      config: {
        name: 'summary-agent',
        description: 'Agent for generating summaries',
        model: config.llm.defaultModel || 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 500
      }
    });

    const result = await summaryAgent.execute(context);

    res.json({
      success: true,
      summary: result.context.toolResults.summary
    });
  } catch (error) {
    logger.error('Summary generation failed', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    next(error instanceof ApiError ? error : new ApiError(500, 'Summary generation failed'));
  }
});

logger.info('Agent router initialization complete');

export default router; 