/**
 * Docker-specific test for LLM service with tokenizer
 * 
 * This test verifies:
 * 1. Tokenizer initialization and functionality
 * 2. LLM service with Ollama
 * 3. Streaming responses
 * 4. Memory management with Redis
 * 5. Vector storage with Supabase
 * 
 * Run with: docker compose exec backend npx ts-node src/test-llm-docker.ts
 */

import { LLMService } from './services/llm';
import { TokenCounter } from './services/llm/tokens/counter';
import { TokenTracker } from './services/llm/tokens/tracker';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { config } from './config';

// Set log level to info
logger.level = 'info';

// Helper function for logging sections
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Mock WebSocket for testing
class MockWebSocket extends WebSocket {
  private messages: any[] = [];
  private contentBuffer: string = '';

  constructor() {
    super('ws://localhost:3001'); // This won't actually connect
  }

  send(data: string): void {
    const parsed = JSON.parse(data);
    this.messages.push(parsed);
    
    if (parsed.type === 'token' && parsed.content) {
      this.contentBuffer += parsed.content;
      process.stdout.write('.');
    }
  }

  getMessages(): any[] {
    return this.messages;
  }

  getContent(): string {
    return this.contentBuffer;
  }
}

async function testLLMService() {
  logSection('LLM Service Docker Test');

  try {
    // Initialize LLM service with all components
    const llmService = new LLMService({
      model: {
        provider: 'ollama',
        modelId: 'llama3.2',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://ollama:11434',
        temperature: 0.7,
      },
      memory: {
        redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
        sessionTTL: 3600,
        ...(config.database.supabaseUrl && config.database.supabaseKey ? {
          vectorStore: {
            type: 'supabase',
            supabaseUrl: config.database.supabaseUrl,
            supabaseKey: config.database.supabaseKey,
            tableName: 'message_embeddings',
          }
        } : {})
      }
    });

    // Test 1: Initialize Service
    logSection('Test 1: Service Initialization');
    
    logger.info('Initializing LLM service...');
    await llmService.initialize();
    logger.info('✅ LLM service initialized successfully');

    // Test 2: Tokenizer Functionality
    logSection('Test 2: Tokenizer Test');
    
    const testText = "Hello, this is a test of the tokenizer functionality!";
    const tokenCounter = new TokenCounter();
    const tokenCount = await tokenCounter.countTokens(testText);
    
    logger.info(`Test text: "${testText}"`);
    logger.info(`Token count: ${tokenCount}`);
    logger.info('✅ Tokenizer test completed');

    // Test 3: Basic Chat
    logSection('Test 3: Basic Chat Test');
    
    const sessionId = `test-${uuidv4()}`;
    const response = await llmService.chat({
      sessionId,
      message: 'What is the capital of France? Keep it very brief.',
      systemPrompt: 'You are a helpful AI assistant. Always be brief and concise.'
    });

    logger.info(`Response: "${response.text}"`);
    logger.info(`Tokens used: ${JSON.stringify(response.metadata?.tokens)}`);
    logger.info('✅ Basic chat test completed');

    // Test 4: Streaming Chat
    logSection('Test 4: Streaming Test');
    
    const ws = new MockWebSocket();
    const streamingResponse = await llmService.chat({
      sessionId,
      message: 'What is an LLM? Answer in one sentence.',
      websocket: ws as any
    });

    // Wait for streaming to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const messages = ws.getMessages();
    logger.info(`Received ${messages.length} WebSocket messages`);
    logger.info(`Final content: "${ws.getContent()}"`);
    logger.info('✅ Streaming test completed');

    // Test 5: Vector Search (only if Supabase is configured)
    if (config.database.supabaseUrl && config.database.supabaseKey) {
      logSection('Test 5: Vector Search Test');
      
      // First, add some messages for searching
      await llmService.chat({
        sessionId,
        message: 'Tell me about artificial intelligence.',
      });

      await llmService.chat({
        sessionId,
        message: 'What are neural networks?',
      });

      // Now search for similar messages
      const searchResults = await llmService.findSimilarMessages(
        sessionId,
        'How does machine learning work?',
        { limit: 2, threshold: 0.7 }
      );

      logger.info(`Found ${searchResults.length} similar messages:`);
      searchResults.forEach((msg, i) => {
        logger.info(`${i + 1}. "${msg.content}" (similarity: ${msg.metadata?.similarity})`);
      });
      logger.info('✅ Vector search test completed');
    } else {
      logger.info('Skipping vector search test - Supabase not configured');
    }

    // Test 6: Token Tracking
    logSection('Test 6: Token Tracking Test');
    
    const tokenUsage = await llmService.getSessionTokenUsage(sessionId);
    logger.info('Token usage statistics:');
    logger.info(`- Prompt tokens: ${tokenUsage.prompt}`);
    logger.info(`- Completion tokens: ${tokenUsage.completion}`);
    logger.info(`- Total tokens: ${tokenUsage.total}`);
    logger.info('✅ Token tracking test completed');

    // Cleanup
    logSection('Cleanup');
    await llmService.shutdown();
    logger.info('✅ Service shut down successfully');

    logSection('All Tests Completed Successfully');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  testLLMService()
    .then(() => {
      logger.info('All tests completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Tests failed:', error);
      process.exit(1);
    });
} 