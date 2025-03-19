/**
 * Simple test to verify the LLM service works without token tracking
 * but with all other functionality like vector store intact
 */

import { LLMService } from './services/llm';
import logger from './utils/logger';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set log level to info
logger.level = 'info';

async function testLLMServiceWithoutTokens() {
  logger.info('Testing LLM Service without token tracking but with full memory functionality...');
  
  // Get Supabase configuration from environment variables
  const supabaseUrl = 'https://noxhmkxcoqxbzdgctvqy.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
  
  if (!supabaseKey) {
    logger.error('Supabase Anon Key is missing from environment variables!');
    process.exit(1);
  }
  
  logger.info(`Using Supabase URL: ${supabaseUrl}`);
  logger.info('Supabase anon key is available');
  
  // Create LLM service with full memory configuration including vector store
  const llmService = new LLMService({
    model: {
      provider: 'ollama',
      modelId: 'llama3.2',
      baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      temperature: 0.7,
    },
    memory: {
      redisUrl: 'redis://localhost:6379',
      sessionTTL: 3600,
      vectorStore: {
        type: 'supabase',
        supabaseUrl,
        supabaseKey,
        tableName: 'message_embeddings'
      }
    }
  });

  try {
    logger.info('Initializing LLM service...');
    await llmService.initialize();
    logger.info('LLM service initialized successfully!');

    // Simple short chat to verify functionality
    logger.info('Sending a test chat message...');
    const response = await llmService.chat({
      message: 'Hello, give me a one-sentence greeting',
    });

    logger.info('Response received:');
    logger.info(`"${response.text}"`);
    logger.info('Metadata:', JSON.stringify(response.metadata));
    
    logger.info('Test completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Test failed with detailed error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testLLMServiceWithoutTokens(); 