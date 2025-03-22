/**
 * Voice Agent
 * 
 * This agent is responsible for speech-to-text transcription, converting
 * audio input into text for further processing.
 */

import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import { DeepgramService } from '../voice/deepgram';
import logger from '../../utils/logger';

interface TranscriptionResult {
  text: string;
  confidence?: number;
  words?: any[];
  simulated?: boolean; // Add simulated flag for internal use
}

// Define the voice results type to match the one in AgentContext
interface VoiceResults {
  text?: string;
  confidence?: number;
  words?: any[];
  audio?: string;
}

// Type guard to check if a value is a TranscriptionResult
function isTranscriptionResult(value: any): value is TranscriptionResult {
  return typeof value === 'object' && value !== null && typeof value.text === 'string';
}

export class VoiceAgent extends BaseAgent {
  private voiceService: DeepgramService;

  constructor(options: any) {
    super(options);
    this.voiceService = new DeepgramService();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // For direct API testing with voiceText
      if (context.flags.voiceText) {
        logger.info('Using provided voiceText as simulated transcription', {
          textLength: context.flags.voiceText.length,
          agent: this.config.name,
          model: this.config.model
        });
        
        // Create a transcription result
        const transcription: TranscriptionResult = {
          text: context.flags.voiceText,
          confidence: 0.98,
          simulated: true
        };
        
        // Add to context
        if (!context.toolResults) context.toolResults = {};
        
        // Initialize voice results with proper typing
        context.toolResults.voice = {
          text: transcription.text,
          confidence: transcription.confidence
        } as VoiceResults;
        
        // Update the message for downstream agents
        context.message = transcription.text;
        
        // Add step to context
        this.addStep(context, 'simulated audio input', {
          status: 'success',
          type: 'stt-simulated',
          text: transcription.text
        });
        
        return {
          output: transcription,
          context
        };
      }
      
      // Handle actual audio input
      if (context.audioInput) {
        logger.info('Transcribing audio input', {
          audioSize: context.audioInput.length,
          agent: this.config.name,
          model: this.config.model
        });
        
        // Get options from context flags if available
        const options = {
          language: context.flags.voiceOptions?.language || 'en-US',
          model: context.flags.voiceOptions?.sttModel || 'nova-2'
        };
        
        // Transcribe audio
        const transcriptionResult = await this.executeTool('stt', {
          audio: context.audioInput,
          options
        }, context);
        
        // Ensure we have a properly structured result
        const processedResult = isTranscriptionResult(transcriptionResult) 
          ? transcriptionResult 
          : { text: String(transcriptionResult), confidence: 0.8 };
        
        // Add to context
        if (!context.toolResults) context.toolResults = {};
        
        // Initialize with proper typing
        context.toolResults.voice = {
          text: processedResult.text,
          confidence: processedResult.confidence
        } as VoiceResults;
        
        // Add words if available
        if (processedResult.words) {
          (context.toolResults.voice as VoiceResults).words = processedResult.words;
        }
        
        // Update the message for downstream agents
        context.message = processedResult.text;
        
        // Add step to context
        this.addStep(context, 'audio input', {
          status: 'success',
          type: 'stt',
          text: processedResult.text
        });
        
        return {
          output: processedResult,
          context
        };
      }
      
      // No voice input provided
      logger.warn('No voice input provided (neither voiceText nor audioInput)', {
        agent: this.config.name,
        model: this.config.model
      });
      
      throw new Error('Voice agent requires either voiceText or audioInput');
    } catch (error) {
      logger.error('Voice transcription failed', {
        error: error instanceof Error ? error.message : String(error),
        agent: this.config.name,
        model: this.config.model
      });
      
      throw error;
    }
  }

  protected async executeTool(
    toolName: string,
    args: any,
    context: AgentContext
  ): Promise<TranscriptionResult | string> {
    if (toolName !== 'stt') {
      throw new Error(`Unknown tool: ${toolName}`);
    }
    
    try {
      // Transcribe audio to text, treating the response as unknown initially
      const transcription: unknown = await this.voiceService.speechToText(
        args.audio, 
        args.options || {}
      );
      
      // Handle string response
      if (typeof transcription === 'string') {
        logger.debug('Speech-to-text completed with string result', {
          transcriptionLength: transcription.length
        });
        
        return {
          text: transcription,
          confidence: 0.8 // Default confidence
        };
      } 
      
      // Handle object response safely
      if (transcription && typeof transcription === 'object' && 'text' in transcription) {
        // Safe to access properties now
        const result: TranscriptionResult = {
          text: typeof (transcription as any).text === 'string' 
            ? (transcription as any).text 
            : String(transcription),
          confidence: typeof (transcription as any).confidence === 'number' 
            ? (transcription as any).confidence 
            : 0.8,
          words: Array.isArray((transcription as any).words) 
            ? (transcription as any).words 
            : undefined
        };
        
        logger.debug('Speech-to-text completed with detailed result', {
          transcriptionLength: result.text.length,
          confidence: result.confidence
        });
        
        return result;
      }
      
      // Fallback case - convert whatever we got to a string
      return {
        text: String(transcription),
        confidence: 0.5
      };
    } catch (error) {
      logger.error('Speech-to-text failed', {
        error: error instanceof Error ? error.message : String(error),
        agent: this.config.name,
        model: this.config.model
      });
      
      throw error;
    }
  }
} 