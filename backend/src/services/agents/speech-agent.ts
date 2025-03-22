/**
 * Speech Agent
 * 
 * This agent is responsible for text-to-speech synthesis, converting
 * text responses into speech audio.
 */

import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import { DeepgramService } from '../voice/deepgram';
import logger from '../../utils/logger';

export class SpeechAgent extends BaseAgent {
  private voiceService: DeepgramService;

  constructor(options: any) {
    super(options);
    this.voiceService = new DeepgramService();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      // Get the text to synthesize - either from the response or directly from context
      const textToSynthesize = context.toolResults?.response || context.message;
      
      if (!textToSynthesize) {
        throw new Error('No text available to synthesize');
      }

      logger.info('Synthesizing speech for response', {
        textLength: textToSynthesize.length,
        agent: this.config.name,
        model: this.config.model
      });

      // Convert text to speech
      const speechResult = await this.executeTool('tts', {
        text: textToSynthesize
      }, context);

      // Add result to context
      if (!context.toolResults) context.toolResults = {};
      context.toolResults.speech = speechResult;

      // Add step to context
      this.addStep(context, textToSynthesize, {
        status: 'success',
        type: 'tts',
        audioSize: speechResult.audio.length
      });

      return {
        output: speechResult,
        context
      };
    } catch (error) {
      logger.error('Speech synthesis failed', {
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
  ): Promise<any> {
    if (toolName !== 'tts') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      // Get voice options from context flags if available
      const voiceOptions = {
        voice: context.flags?.voiceOptions?.voice || 'nova',
        model: context.flags?.voiceOptions?.model || 'nova-2',
        speed: context.flags?.voiceOptions?.speed || 1.0,
        pitch: context.flags?.voiceOptions?.pitch || 1.0
      };

      // Convert text to speech
      const audioBuffer = await this.voiceService.textToSpeech(args.text, voiceOptions);
      
      // Convert to base64 for JSON transport
      const result = {
        audio: audioBuffer.toString('base64'),
        format: 'wav',
        text: args.text
      };

      logger.debug('Text-to-speech completed', {
        textLength: args.text.length,
        audioSize: audioBuffer.length,
        format: 'wav'
      });

      return result;
    } catch (error) {
      logger.error('Text-to-speech failed', {
        error: error instanceof Error ? error.message : String(error),
        agent: this.config.name,
        model: this.config.model
      });

      throw error;
    }
  }
} 