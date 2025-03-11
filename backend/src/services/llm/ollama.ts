// @ts-nocheck
/**
 * ollama service
 * 
 * implements the LLMProvider interface for Ollama.
 * handles streaming responses, model listing, and configuration.
 */

import { EventEmitter } from 'events';
import { config } from '../../config/index';
import logger from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';

// interfaces for the ollama service
export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaCompletionRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    stop?: string[];
  };
  system?: string;
  context?: number[];
}

export interface OllamaCompletionResponse {
  model: string;
  created_at: string;
  response: string;
  context: number[];
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// type for stream controller
export interface StreamController extends EventEmitter {
  abort: () => void;
}

// ollama service implementation
export const ollamaService = {
  /**
   * base url for ollama api
   */
  baseUrl: config.llm.ollamaBaseUrl,

  /**
   * fetches a list of available models from ollama
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`ollama returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('failed to fetch models from ollama', { error });
      throw new ApiError(502, 'failed to connect to ollama service');
    }
  },
  
  /**
   * generates a completion using ollama's api with streaming
   * returns an event emitter that emits 'data', 'end', and 'error' events
   */
  async generateCompletion(
    params: OllamaCompletionRequest
  ): Promise<StreamController> {
    // create a new event emitter for the stream
    const streamController = new EventEmitter() as StreamController;
    
    // create abort controller for the fetch request
    const abortController = new AbortController();
    streamController.abort = () => abortController.abort();
    
    // ensure streaming is enabled
    params.stream = true;
    
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: abortController.signal,
      });
      
      if (!response.ok) {
        throw new Error(`ollama returned ${response.status}: ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('response body is null');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let context: number[] = [];

      // process the stream
      const processStream = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            
            if (done) {
              streamController.emit('end', { context });
              break;
            }
            
            // decode and process chunk
            buffer += decoder.decode(value, { stream: true });
            
            // process complete json objects from buffer
            let startIdx = 0;
            let endIdx = buffer.indexOf('\n', startIdx);
            
            while (endIdx > -1) {
              const chunk = buffer.substring(startIdx, endIdx);
              startIdx = endIdx + 1;
              endIdx = buffer.indexOf('\n', startIdx);
              
              if (chunk.trim()) {
                try {
                  const data = JSON.parse(chunk) as OllamaCompletionResponse;
                  
                  // emit data event with token and response object
                  streamController.emit('data', data);
                  
                  // save context for future use
                  if (data.context) {
                    context = data.context;
                  }
                  
                  // emit end event when done
                  if (data.done) {
                    streamController.emit('end', { context });
                  }
                } catch (e) {
                  logger.warn('failed to parse json from ollama', { 
                    chunk, 
                    error: e 
                  });
                }
              }
            }
            
            // keep any remaining incomplete chunk in buffer
            buffer = buffer.substring(startIdx);
          }
        } catch (error) {
          if ((error as any).name === 'AbortError') {
            streamController.emit('abort');
          } else {
            logger.error('error processing ollama stream', { error });
            streamController.emit('error', error);
          }
        }
      };
      
      // start processing the stream
      processStream();
      return streamController;
      
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        streamController.emit('abort');
      } else {
        logger.error('failed to connect to ollama', { error });
        streamController.emit('error', new ApiError(502, 'failed to connect to ollama service'));
      }
      
      return streamController;
    }
  }
}; 