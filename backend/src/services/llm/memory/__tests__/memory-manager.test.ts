import { MemoryManager } from '../index';
import { MemoryConfig } from '../config';
import { Message } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../../utils/logger';
import { ChatOllama } from '@langchain/community/chat_models/ollama';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Use real Redis instance
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OLLAMA_BASE_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';

async function testMemoryManager() {
  logSection('Testing Memory Manager');

  try {
    // Initialize Memory Manager with configuration
    const config: MemoryConfig = {
      redis: {
        enabled: true,
        url: REDIS_URL,
        prefix: 'test:memory:',
        sessionTTL: 300 // 5 minutes for testing
      },
      defaults: {
        maxContextSize: 10,
        sessionTTL: 3600,
        maxMessageSize: 1024 * 1024,
        contextWindowPercentage: 80
      },
      langchain: {
        enabled: true,
        model: new ChatOllama({
          baseUrl: OLLAMA_BASE_URL,
          model: 'llama2',
          temperature: 0.7
        }),
        memory: {
          useLangChainMemory: true,
          maxMessages: 50
        }
      }
    };

    const memoryManager = new MemoryManager(config);
    await memoryManager.initialize();
    logger.info('✓ Memory Manager initialized');

    // Test 1: Store and Retrieve Message
    logSection('Test: Message Storage and Retrieval');
    const sessionId = uuidv4();
    const testMessage: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: 'Test message',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 2 }
    };

    await memoryManager.storeMessage(testMessage);
    logger.info('✓ Message stored');

    const retrievedMessage = await memoryManager.getMessage(testMessage.id);
    if (!retrievedMessage || retrievedMessage.id !== testMessage.id) {
      throw new Error('Message retrieval failed');
    }
    logger.info('✓ Message retrieved successfully');

    // Test 2: Get Messages for Session
    logSection('Test: Get Session Messages');
    const messages = await memoryManager.getMessages(sessionId);
    if (!messages.length || messages[0].id !== testMessage.id) {
      throw new Error('Session messages retrieval failed');
    }
    logger.info('✓ Session messages retrieved successfully');

    // Test 3: Context Assembly
    logSection('Test: Context Assembly');
    const context = await memoryManager.assembleContext(
      sessionId,
      'What is the context?',
      {
        maxTokens: 1000,
        maxMessages: 10
      }
    );

    if (!context || !context.messages) {
      throw new Error('Context assembly failed');
    }
    logger.info('✓ Context assembled successfully', {
      messageCount: context.messages.length,
      metadata: context.metadata
    });

    // Test 4: Similar Messages Search
    logSection('Test: Similar Messages Search');
    const similarMessages = await memoryManager.searchSimilarMessages(
      sessionId,
      'test query',
      { limit: 5 }
    );
    logger.info('✓ Similar messages search completed', {
      found: similarMessages.length
    });

    // Test 5: Cleanup
    logSection('Test: Cleanup');
    await memoryManager.cleanup();
    logger.info('✓ Cleanup completed');

    logger.info('\n✅ All Memory Manager tests passed successfully!\n');
    return true;
  } catch (error) {
    logger.error('Memory Manager tests failed:', error);
    return false;
  }
}

// Run the tests
testMemoryManager().then(success => {
  if (!success) {
    process.exit(1);
  }
}); 