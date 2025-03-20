import { BaseAgent } from './base/base-agent';
import { AgentContext, AgentResult } from './base/types';
import { DeepgramService } from '../voice/deepgram';
import logger from '../../utils/logger';

export class VoiceAgent extends BaseAgent {
  private voiceService: DeepgramService;

  constructor(options: any) {
    super(options);
    this.voiceService = new DeepgramService();
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const analysis = context.toolResults?.queryAnalysis;
      
      // Handle text-to-speech if needed
      if (analysis?.needsVoice && analysis?.voiceText) {
        const voiceResult = await this.executeTool('tts', {
          text: analysis.voiceText
        }, context);

        // Add voice result to context
        if (!context.toolResults) context.toolResults = {};
        if (!context.toolResults.voice) context.toolResults.voice = {};
        context.toolResults.voice.audio = voiceResult.audio;

        this.addStep(context, analysis.voiceText, {
          status: 'success',
          type: 'tts',
          length: voiceResult.audio.length
        });

        return {
          output: voiceResult,
          context
        };
      }

      // Handle speech-to-text if audio input is present
      if (context.audioInput) {
        const transcription = await this.executeTool('stt', {
          audio: context.audioInput
        }, context);

        // Add transcription to context
        if (!context.toolResults) context.toolResults = {};
        if (!context.toolResults.voice) context.toolResults.voice = {};
        context.toolResults.voice.text = transcription.text;

        this.addStep(context, 'audio input', {
          status: 'success',
          type: 'stt',
          text: transcription.text
        });

        return {
          output: transcription,
          context
        };
      }

      return { output: null, context };
    } catch (error) {
      logger.error('Voice operation failed', {
        error: error instanceof Error ? error.message : String(error),
        hasAudioInput: !!context.audioInput,
        needsVoice: context.toolResults?.queryAnalysis?.needsVoice
      });

      throw error;
    }
  }

  protected async executeTool(
    toolName: string,
    args: any,
    context: AgentContext
  ): Promise<any> {
    if (!['tts', 'stt'].includes(toolName)) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    if (this.streaming?.onToolStart) {
      this.streaming.onToolStart(toolName);
    }

    try {
      let result;
      if (toolName === 'tts') {
        result = await this.voiceService.textToSpeech(args.text);
      } else {
        result = await this.voiceService.speechToText(args.audio);
      }

      if (this.streaming?.onToolEnd) {
        this.streaming.onToolEnd(toolName, result);
      }

      return result;
    } catch (error) {
      logger.error('Voice tool execution failed', {
        tool: toolName,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }
} 