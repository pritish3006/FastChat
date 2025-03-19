/**
 * Comprehensive test for Model Provider (Ollama) component
 * 
 * This test script verifies the functionality of the Ollama provider including:
 * - Model initialization
 * - Model capabilities
 * - Basic completions
 * - Streaming responses
 * - Error handling
 * 
 * Run with: npx ts-node src/test-model-provider.ts
 * 
 * Note: Ollama must be running locally (or set OLLAMA_BASE_URL env var)
 */

import { ModelProviderFactory } from './services/llm/providers';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { BaseModelProvider, ModelConfig } from './services/llm/types';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import logger from './utils/logger';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Helper function to wait for specified milliseconds
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to simulate WebSocket
class MockWebSocket extends EventEmitter {
  private messages: any[] = [];
  
  send(data: string): void {
    this.messages.push(JSON.parse(data));
  }
  
  getMessages(): any[] {
    return this.messages;
  }
  
  close(): void {
    this.emit('close');
  }
}

// Helper to count tokens from a stream
async function countStreamTokens(stream: AsyncIterator<any>): Promise<number> {
  let count = 0;
  let result = await stream.next();
  
  while (!result.done) {
    count++;
    result = await stream.next();
  }
  
  return count;
}

// Main test function
async function testModelProvider() {
  logSection('Model Provider (Ollama) Component Test');
  
  try {
    // Get Ollama base URL from environment or use default
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    logger.info(`Using Ollama at: ${baseUrl}`);
    
    // Test 1: Provider Initialization
    logSection('Test 1: Provider Initialization');
    
    logger.info('Creating Ollama provider...');
    const modelConfig: ModelConfig = {
      provider: 'ollama',
      modelId: 'llama3.2',  // Updated to match available model
      baseUrl: baseUrl,
      temperature: 0.7,
    };
    
    const provider = ModelProviderFactory.getProvider(modelConfig);
    const model = await provider.initialize(modelConfig);
    
    logger.info('Provider and model initialized successfully');
    
    // Test 2: Model Capabilities
    logSection('Test 2: Model Capabilities');
    
    if (model instanceof ChatOllama) {
      logger.info(`Model ID: ${model.model}`);
      logger.info(`Temperature: ${model.temperature}`);
      logger.info(`Provider: Ollama`);
    } else {
      logger.warn('Not an Ollama model - some tests may fail');
    }
    
    // Test 3: Basic Completion
    logSection('Test 3: Basic Completion');
    
    const sessionId = `test-${uuidv4()}`;
    logger.info(`Session ID: ${sessionId}`);
    
    logger.info('Generating a basic completion...');
    const prompt = 'What is the capital of France?';
    logger.info(`Prompt: "${prompt}"`);
    
    const response = await model.invoke([new HumanMessage(prompt)]);
    
    if (response instanceof AIMessage) {
      const content = response.content;
      logger.info(`Response: "${typeof content === 'string' ? content.substring(0, 100) + (content.length > 100 ? '...' : '') : JSON.stringify(content)}"`);
    } else {
      logger.info(`Response: ${JSON.stringify(response).substring(0, 100)}...`);
    }
    
    // Test 4: Streaming Completion
    logSection('Test 4: Streaming Completion');
    
    logger.info('Testing streaming capability...');
    const streamingPrompt = 'Explain what an LLM is in three sentences.';
    logger.info(`Streaming prompt: "${streamingPrompt}"`);
    
    try {
      // Use LangChain's built-in streaming
      const stream = await model.stream([new HumanMessage(streamingPrompt)]);
      
      logger.info('Streaming response:');
      const chunks = [];
      
      for await (const chunk of stream) {
        if (typeof chunk.content === 'string') {
          chunks.push(chunk.content);
          process.stdout.write(chunk.content);
        }
      }
      
      logger.info(`\nReceived ${chunks.length} chunks`);
    } catch (streamError) {
      logger.warn('Direct model streaming failed:', (streamError as Error).message);
      
      // Fall back to provider's streaming method if available
      if (provider.generateStream) {
        try {
          const stream = await provider.generateStream({
            sessionId,
            message: streamingPrompt
          });
          
          let chunksReceived = 0;
          let result = await stream.next();
          
          while (!result.done) {
            chunksReceived++;
            process.stdout.write(typeof result.value === 'string' ? result.value : '.');
            result = await stream.next();
          }
          
          logger.info(`\nReceived ${chunksReceived} stream chunks`);
        } catch (providerStreamError) {
          logger.error('Provider streaming also failed:', (providerStreamError as Error).message);
        }
      } else {
        logger.warn('Streaming not supported by this provider');
      }
    }
    
    // Test 5: Error Handling
    logSection('Test 5: Error Handling');
    
    // Test with invalid model ID
    logger.info('Testing error handling with invalid model ID...');
    
    try {
      const invalidConfig: ModelConfig = {
        provider: 'ollama',
        modelId: 'non_existent_model_' + uuidv4().substring(0, 8),
        baseUrl: baseUrl,
        temperature: 0.7,
      };
      
      const invalidProvider = ModelProviderFactory.getProvider(invalidConfig);
      await invalidProvider.initialize(invalidConfig);
      
      logger.warn('Test with invalid model did not fail as expected');
    } catch (error) {
      logger.info('Error handling test successful - received expected error:', (error as Error).message);
    }
    
    // Test with invalid parameters
    logger.info('Testing error handling with invalid parameters...');
    
    try {
      const invalidParamsConfig: ModelConfig = {
        provider: 'ollama', 
        modelId: 'llama3',
        baseUrl: baseUrl,
        temperature: 2.5, // Invalid temperature (should be 0-1)
      };
      
      provider.validateConfig(invalidParamsConfig);
      
      logger.warn('Test with invalid parameters did not fail as expected');
    } catch (error) {
      logger.info('Error handling test successful - received expected parameter error:', (error as Error).message);
    }
    
    // Reset factory for cleanup
    ModelProviderFactory.clearProviders();
    logger.info('Model provider factory reset');
    
    logSection('All Tests Completed');
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Run the tests
testModelProvider().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 