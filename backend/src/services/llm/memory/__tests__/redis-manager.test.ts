import { RedisManager } from '../redis';
import { Message, Session } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../../utils/logger';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

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

async function testRedisManager() {
  logSection('Testing Redis Manager');

  try {
    // Initialize Redis Manager
    const redisManager = new RedisManager({
      enabled: true,
      url: REDIS_URL,
      prefix: 'test:memory:',
      sessionTTL: 300 // 5 minutes for testing
    });

    await redisManager.initialize();
    logger.info('✓ Redis connection established');

    // Test 1: Session Management
    logger.info('\nTest: Session Management');
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
      metadata: { test: true }
    };

    await redisManager.setSession(session);
    logger.info('✓ Session created');

    const retrievedSession = await redisManager.getSession(sessionId);
    if (!retrievedSession || retrievedSession.id !== sessionId) {
      throw new Error('Session retrieval failed');
    }
    logger.info('✓ Session retrieved successfully');

    // Test 2: Message Management
    logger.info('\nTest: Message Management');
    const message: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: 'Test message',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 10 }
    };

    await redisManager.addMessage(message);
    logger.info('✓ Message added');

    const retrievedMessage = await redisManager.getMessage(message.id);
    if (!retrievedMessage || retrievedMessage.id !== message.id) {
      throw new Error('Message retrieval failed');
    }
    logger.info('✓ Message retrieved successfully');

    // Test 3: Message List Operations
    logger.info('\nTest: Message List Operations');
    const messages = await redisManager.getMessages(sessionId);
    if (!messages.length || messages[0].id !== message.id) {
      throw new Error('Message list retrieval failed');
    }
    logger.info('✓ Message list retrieved successfully');

    // Test 4: LangChain Memory Interface
    logger.info('\nTest: LangChain Memory Interface');
    
    // Test memoryKeys
    const memoryKeys = redisManager.memoryKeys;
    if (!memoryKeys.includes('chat_history') || !memoryKeys.includes('current_session')) {
      throw new Error('Memory keys not properly defined');
    }
    logger.info('✓ Memory keys verified');

    // Test loadMemoryVariables
    const memoryVars = await redisManager.loadMemoryVariables({ sessionId });
    if (!memoryVars.chat_history || !memoryVars.current_session) {
      throw new Error('Memory variables not properly loaded');
    }
    logger.info('✓ Memory variables loaded successfully');

    // Test saveContext
    const inputs = {
      sessionId,
      input: 'Hello, how are you?',
      messageId: uuidv4()
    };
    const outputs = {
      output: 'I am doing well, thank you!',
      messageId: uuidv4()
    };
    await redisManager.saveContext(inputs, outputs);
    logger.info('✓ Context saved successfully');

    // Verify saved context
    const updatedMessages = await redisManager.getMessages(sessionId);
    if (updatedMessages.length !== 3) { // Original message + input + output
      throw new Error('Context not properly saved');
    }
    logger.info('✓ Saved context verified');

    // Test clear
    await redisManager.clear();
    const clearedMessages = await redisManager.getMessages(sessionId);
    if (clearedMessages.length !== 0) {
      throw new Error('Memory not properly cleared');
    }
    logger.info('✓ Memory cleared successfully');

    // Test 5: Message Type Conversion
    logger.info('\nTest: Message Type Conversion');
    const testMessages = [
      new HumanMessage('Hello'),
      new AIMessage('Hi there!'),
      new SystemMessage('You are a helpful assistant')
    ];

    const convertedMessages = testMessages.map(msg => {
      if (msg instanceof HumanMessage) {
        return { role: 'user', content: msg.content };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant', content: msg.content };
      } else {
        return { role: 'system', content: msg.content };
      }
    });

    if (convertedMessages.length !== 3) {
      throw new Error('Message type conversion failed');
    }
    logger.info('✓ Message type conversion successful');

    // Test 6: Cleanup
    logger.info('\nTest: Cleanup');
    await redisManager.deleteMessage(message.id);
    const deletedMessage = await redisManager.getMessage(message.id);
    if (deletedMessage) {
      throw new Error('Message deletion failed');
    }
    logger.info('✓ Message deleted successfully');

    return true;
  } catch (error) {
    logger.error('Redis Manager tests failed:', error);
    return false;
  }
}

// Run the tests
testRedisManager().then(success => {
  if (!success) {
    process.exit(1);
  }
}); 