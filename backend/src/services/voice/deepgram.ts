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
    
    // Debug log the API keys (masked for security)
    if (sttApiKey) {
      const maskedSTTKey = `${sttApiKey.substring(0, 5)}...${sttApiKey.substring(sttApiKey.length - 5)}`;
      logger.debug(`Using STT API key: ${maskedSTTKey}`);
    } else {
      logger.error('STT API key is not configured');
    }
    
    if (ttsApiKey) {
      const maskedTTSKey = `${ttsApiKey.substring(0, 5)}...${ttsApiKey.substring(ttsApiKey.length - 5)}`;
      logger.debug(`Using TTS API key: ${maskedTTSKey}`);
    } else {
      logger.error('TTS API key is not configured');
    }
    
    if (!sttApiKey || !ttsApiKey) {
      throw new Error('Deepgram API keys are not configured');
    }
    
    this.apiKey = sttApiKey;
    this.ttsApiKey = ttsApiKey;
    this.client = new Deepgram(this.apiKey);
  }

  // Helper function to determine audio mimetype from buffer header
  private detectMimeType(buffer: Buffer): string {
    // Check for MP3 header (starts with ID3 or 0xFFF)
    if (buffer.length > 2 && 
        ((buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || // "ID3"
         ((buffer[0] & 0xFF) === 0xFF && (buffer[1] & 0xF0) === 0xF0))) {    // MPEG sync bits
      return 'audio/mpeg';
    }
    
    // Check for WAV header (RIFF....WAVE)
    if (buffer.length > 11 && 
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && // "RIFF"
        buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) { // "WAVE"
      return 'audio/wav';
    }
    
    // Default to WAV if we can't determine
    logger.warn('Could not determine audio format, defaulting to wav');
    return 'audio/wav';
  }

  async speechToText(audioBuffer: Buffer, options: STTOptions = {}): Promise<string> {
    try {
      logger.debug('Starting speech-to-text processing', {
        bufferSize: audioBuffer.length,
        options
      });

      // Detect mimetype from buffer content
      const mimetype = this.detectMimeType(audioBuffer);
      logger.debug('Detected audio format', { mimetype });

      const source = {
        buffer: audioBuffer,
        mimetype
      };

      logger.debug('Sending request to Deepgram API', {
        apiKeyLength: this.apiKey.length,
        apiKeyPrefix: this.apiKey.substring(0, 5),
        options
      });

      // Create request options with better defaults
      const requestOptions = {
        smart_format: true,
        model: options.model || 'nova-2',
        language: options.language || 'en-US',
        punctuate: options.punctuate ?? true,
        profanity_filter: options.profanityFilter ?? false,
        diarize: options.diarize ?? false
      };

      logger.debug('Request options', requestOptions);

      try {
        const response = await this.client.transcription.preRecorded(source, requestOptions);
        
        logger.debug('Received response from Deepgram', {
          hasResults: !!response.results,
          hasChannels: !!response.results?.channels?.length,
          hasAlternatives: !!response.results?.channels[0]?.alternatives?.length
        });

        const transcript = response.results?.channels[0]?.alternatives[0]?.transcript;
        
        if (!transcript) {
          logger.error('No transcript returned', { 
            response: JSON.stringify(response) 
          });
          throw new Error('No transcript returned from Deepgram');
        }

        logger.info('Speech-to-text completed', { 
          duration: response.metadata?.duration,
          model: response.metadata?.models?.[0],
          transcriptLength: transcript.length
        });

        return transcript;
      } catch (apiError) {
        logger.error('Deepgram API error', {
          error: apiError instanceof Error ? {
            name: apiError.name,
            message: apiError.message,
            stack: apiError.stack
          } : String(apiError)
        });
        throw apiError;
      }
    } catch (error) {
      logger.error('Speech-to-text failed', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error),
        audioBufferSize: audioBuffer.length
      });
      throw error;
    }
  }

  async textToSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
    try {
      // Log the options for debugging but only send the required 'text' parameter
      logger.debug('Text-to-speech options (not sent to API):', options);
      
      const response = await fetch(this.ttsBaseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.ttsApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Only include the required 'text' parameter
          text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Deepgram TTS API error response:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`Deepgram TTS API error: ${response.status} ${response.statusText}`);
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