import { TavilySearchService } from '../../search/tavily';
import { DeepgramService } from '../../voice/deepgram';
import logger from '../../../utils/logger';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

// Tool function definitions for OpenAI
export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search the internet for current information about a topic',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query'
          },
          searchDepth: {
            type: 'string',
            enum: ['basic', 'advanced'],
            description: 'How deep to search. Use advanced for complex queries requiring detailed information.'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (1-10)',
            minimum: 1,
            maximum: 10
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'textToSpeech',
      description: 'Convert text to speech using Deepgram\'s TTS service',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to convert to speech'
          },
          voice: {
            type: 'string',
            enum: ['nova', 'stella', 'shimmer'],
            description: 'The voice to use'
          },
          speed: {
            type: 'number',
            description: 'Speech speed (0.5 to 2.0)',
            minimum: 0.5,
            maximum: 2.0
          },
          pitch: {
            type: 'number',
            description: 'Voice pitch (0.5 to 2.0)',
            minimum: 0.5,
            maximum: 2.0
          }
        },
        required: ['text']
      }
    }
  }
];

export class ToolManager {
  private searchService: TavilySearchService;
  private voiceService: DeepgramService;

  constructor() {
    this.searchService = new TavilySearchService();
    this.voiceService = new DeepgramService();
  }

  async executeFunction(name: string, args: any): Promise<any> {
    logger.info('Executing tool function', { name, args });

    try {
      switch (name) {
        case 'search':
          return await this.searchService.search(args.query, {
            searchDepth: args.searchDepth || 'basic',
            maxResults: args.maxResults || 3
          });

        case 'textToSpeech': {
          const audioBuffer = await this.voiceService.textToSpeech(args.text, {
            voice: args.voice || 'nova',
            speed: args.speed || 1.0,
            pitch: args.pitch || 1.0
          });
          
          // Convert audio buffer to base64 for transmission
          return {
            audio: audioBuffer.toString('base64'),
            format: 'wav'
          };
        }

        default:
          throw new Error(`Unknown function: ${name}`);
      }
    } catch (error) {
      logger.error('Tool execution failed', {
        tool: name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getToolDefinitions() {
    return TOOL_DEFINITIONS;
  }
} 