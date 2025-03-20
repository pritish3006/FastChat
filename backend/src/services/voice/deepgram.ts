import { Deepgram } from '@deepgram/sdk';
import { config } from '../../config';
import logger from '../../utils/logger';

export interface TTSOptions {
  voice?: string;
  model?: string;
  speed?: number;
  pitch?: number;
}

export interface STTOptions {
  language?: string;
  model?: string;
  punctuate?: boolean;
  profanityFilter?: boolean;
  diarize?: boolean;
}

export class DeepgramService {
  private readonly apiKey: string;
  private readonly ttsApiKey: string;
  private readonly client: Deepgram;
  private readonly ttsBaseUrl = 'https://api.deepgram.com/v1/speak';

  constructor() {
    const sttApiKey = config.voice?.sttApiKey;
    const ttsApiKey = config.voice?.ttsApiKey;
    
    if (!sttApiKey || !ttsApiKey) {
      throw new Error('Deepgram API keys are not configured');
    }
    
    this.apiKey = sttApiKey;
    this.ttsApiKey = ttsApiKey;
    this.client = new Deepgram(this.apiKey);
  }

  async speechToText(audioBuffer: Buffer, options: STTOptions = {}): Promise<string> {
    try {
      const source = {
        buffer: audioBuffer,
        mimetype: 'audio/wav' // Adjust based on your input format
      };

      const response = await this.client.transcription.preRecorded(source, {
        smart_format: true,
        model: options.model || 'nova-2',
        language: options.language || 'en-US',
        punctuate: options.punctuate ?? true,
        profanity_filter: options.profanityFilter ?? false,
        diarize: options.diarize ?? false
      });

      const transcript = response.results?.channels[0]?.alternatives[0]?.transcript;
      
      if (!transcript) {
        throw new Error('No transcript returned from Deepgram');
      }

      logger.info('Speech-to-text completed', { 
        duration: response.metadata?.duration,
        model: response.metadata?.models?.[0]
      });

      return transcript;
    } catch (error) {
      logger.error('Speech-to-text failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async textToSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    try {
      const response = await fetch(this.ttsBaseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.ttsApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice: options.voice || 'nova',
          model: options.model || 'nova-2',
          speed: options.speed || 1.0,
          pitch: options.pitch || 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`Deepgram TTS API error: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      logger.info('Text-to-speech completed', { 
        textLength: text.length,
        audioSize: audioBuffer.byteLength 
      });

      return Buffer.from(audioBuffer);
    } catch (error) {
      logger.error('Text-to-speech failed', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length
      });
      throw error;
    }
  }
} 