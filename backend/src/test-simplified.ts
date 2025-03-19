/**
 * Simplified test for Fast Chat key components
 * This test focuses on:
 * 1. StreamingManager content accumulation
 * 2. BranchManager with editMessage
 *
 * Run with: npx ts-node backend/src/test-simplified.ts
 * 
 * This test avoids the tokenizer dependency which is causing issues.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { RedisManager } from './services/llm/memory/redis';
import { BranchManager } from './services/llm/memory/branch';
import { StreamingManager } from './services/llm/streaming';
import { MockWebSocket } from './utils/test-helpers';
import { Message } from './services/llm/types';
import { WebSocket } from 'ws';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

/**
 * Main test function
 */
async function runTests() {
  try {
    logSection('Simplified Component Tests');
    
    // Initialize Redis
    logSection('Initializing Redis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisManager = new RedisManager({
      enabled: true,
      url: redisUrl,
      prefix: 'test-simplified:',
      sessionTTL: 60 * 60, // 1 hour
      maxRetries: 3,
      retryTimeout: 1000
    });
    
    await redisManager.connect();
    logger.info('Redis Manager initialized successfully');
    
    // Test StreamingManager
    await testStreamingManager(redisManager);
    
    // Test BranchManager
    await testBranchManager(redisManager);
    
    // Cleanup
    logger.info('Tests completed successfully, cleaning up...');
    await redisManager.disconnect();
    logger.info('Redis connection closed');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

/**
 * Test StreamingManager content accumulation
 */
async function testStreamingManager(redisManager: RedisManager) {
  logSection('Testing StreamingManager Content Accumulation');
  
  // Create StreamingManager instance
  const streamingManager = new StreamingManager(redisManager);
  
  // Create test session and message IDs
  const sessionId = `test-session-${uuidv4().substring(0, 8)}`;
  const messageId = `test-message-${uuidv4().substring(0, 8)}`;
  const requestId = `test-request-${uuidv4().substring(0, 8)}`;
  
  logger.info(`Session ID: ${sessionId}`);
  logger.info(`Message ID: ${messageId}`);
  logger.info(`Request ID: ${requestId}`);
  
  // Create mock WebSocket
  const mockWebSocket = new MockWebSocket();
  
  // Register connection - fix type compatibility issue with type assertion
  const connectionId = streamingManager.registerConnection(sessionId, mockWebSocket as unknown as WebSocket);
  logger.info('Connection registered');
  
  // Create test tokens
  const testTokens = [
    "Hello",
    " world",
    "!",
    " This",
    " is",
    " a",
    " test",
    " of",
    " content",
    " accumulation",
    "."
  ];
  
  // Define an async generator function to yield tokens
  async function* generateTokens() {
    for (const token of testTokens) {
      yield token;
      // Add a small delay to simulate real-time streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  // Stream response - fix method call to use individual parameters
  logger.info('Starting to stream tokens...');
  const streamProgress = await streamingManager.streamResponse(
    connectionId,
    sessionId,
    messageId,
    generateTokens(),
    {
      onStart: () => logger.info('Accumulation test started'),
      onToken: () => process.stdout.write('.'),
      onComplete: () => logger.info('\nAccumulation test completed')
    }
  );
  
  // Get accumulated content - use the requestId from the streamProgress
  const contentByRequestId = streamingManager.getStreamContent(streamProgress.requestId);
  const contentByMessageId = streamingManager.getContentByMessageId(messageId);
  
  // Verify content
  const expectedContent = testTokens.join('');
  logger.info(`Expected content: "${expectedContent}"`);
  logger.info(`Content by request ID: "${contentByRequestId}"`);
  logger.info(`Content by message ID: "${contentByMessageId}"`);
  
  // Assert content matches
  if (contentByRequestId === expectedContent) {
    logger.info('✅ Content by request ID matches expected content');
  } else {
    throw new Error('Content by request ID does not match expected content');
  }
  
  if (contentByMessageId === expectedContent) {
    logger.info('✅ Content by message ID matches expected content');
  } else {
    throw new Error('Content by message ID does not match expected content');
  }
  
  // Test resource cleanup
  logger.info('Testing resource cleanup...');
  streamingManager.cleanupMessageResources(messageId);
  
  const contentAfterCleanup = streamingManager.getStreamContent(streamProgress.requestId);
  logger.info(`Content after cleanup: ${contentAfterCleanup === null ? 'null (expected)' : contentAfterCleanup}`);
  
  if (contentAfterCleanup === null) {
    logger.info('✅ Resource cleanup successful');
  } else {
    throw new Error('Resource cleanup failed - content still available');
  }
  
  logger.info('StreamingManager test completed successfully');
}

/**
 * Test BranchManager with editMessage
 */
async function testBranchManager(redisManager: RedisManager) {
  logSection('Testing BranchManager with editMessage');
  
  try {
    // Create BranchManager instance
    const branchManager = new BranchManager(redisManager);
    
    // Create test session
    const sessionId = `test-branch-session-${uuidv4().substring(0, 8)}`;
    logger.info(`Session ID: ${sessionId}`);
    
    // Create session in Redis
    logger.info('Creating session in Redis...');
    await redisManager.setSession({
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
      metadata: {
        test: true,
        name: 'Test Session for Branch Manager'
      }
    });
    logger.info('Session created successfully');
    
    // Create initial messages
    logger.info('Creating initial messages...');
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'Tell me about the solar system.' },
      { role: 'assistant' as const, content: 'The solar system consists of the Sun and planets.' }
    ];
    
    // Setup session with initial messages - fix missing createMessage method
    const messageIds = [];
    for (const msg of messages) {
      const message: Message = {
        id: uuidv4(),
        sessionId,
        content: msg.content,
        role: msg.role,
        timestamp: Date.now(),
        version: 1
      };
      await redisManager.storeMessage(message);
      messageIds.push(message.id);
      logger.info(`Stored message with ID: ${message.id}`);
    }
    
    // Create a branch
    logger.info('Creating a branch...');
    const branchName = 'Edit Test Branch';
    // Use the last message ID as the origin message ID
    const originMessageId = messageIds[messageIds.length - 1];
    logger.info(`Using message ID ${originMessageId} as origin for branch`);
    const branchId = await branchManager.createBranch(sessionId, originMessageId, { name: branchName });
    logger.info(`Branch created with ID: ${branchId}`);
    
    // Switch to the branch - fix type issue by treating branchId as string
    logger.info('Switching to branch...');
    await branchManager.switchBranch(sessionId, typeof branchId === 'object' ? branchId.id : branchId);
    
    // Get messages in the branch
    const initialMessages = await redisManager.getMessages(sessionId);
    logger.info(`Initial message count: ${initialMessages.length}`);
    
    // Check if there are messages to edit
    if (initialMessages.length < 3) {
      throw new Error(`Expected at least 3 messages, but found ${initialMessages.length}`);
    }
    
    // Edit a message
    const messageToEdit = initialMessages[2]; // The assistant message
    const originalContent = messageToEdit.content;
    const editedContent = 'The solar system consists of the Sun, eight planets, dwarf planets, moons, asteroids, and comets.';
    
    logger.info(`Editing message ${messageToEdit.id}...`);
    logger.info(`Original content: "${originalContent}"`);
    logger.info(`New content: "${editedContent}"`);
    
    // Fix editMessage parameters - remove sessionId parameter
    await branchManager.editMessage(messageToEdit.id, editedContent);
    
    // Get updated messages
    const updatedMessages = await redisManager.getMessages(sessionId);
    logger.info(`Updated message count: ${updatedMessages.length}`);
    
    // Log all messages to help debug
    for (const msg of updatedMessages) {
      logger.info(`Message ID: ${msg.id}, Role: ${msg.role}, Content: "${msg.content.substring(0, 30)}..."`);
    }
    
    // Try to find the edited message
    const editedMessage = updatedMessages.find(msg => msg.content === editedContent);
    
    if (editedMessage) {
      logger.info(`✅ Found edited message with ID: ${editedMessage.id}`);
      if (editedMessage.id !== messageToEdit.id) {
        logger.info(`Note: The edited message has a new ID: ${editedMessage.id} (original: ${messageToEdit.id})`);
      }
    } else {
      throw new Error('Message editing failed - could not find edited message');
    }
    
    // Delete the test branch - fix type issue by treating branchId as string
    logger.info('Cleaning up branch...');
    await branchManager.deleteBranch(sessionId, typeof branchId === 'object' ? branchId.id : branchId);
    
    logger.info('BranchManager test completed successfully');
  } catch (error) {
    logger.error('BranchManager test failed with error:');
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
      if ('stack' in error) {
        logger.error(`Stack: ${error.stack}`);
      }
      if ('context' in error) {
        logger.error(`Context: ${JSON.stringify(error.context)}`);
      }
    } else {
      logger.error(`Unknown error: ${JSON.stringify(error)}`);
    }
    throw error; // Re-throw to stop the test
  }
}

// Run the tests
if (require.main === module) {
  runTests()
    .then(() => {
      logger.info('All tests completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Tests failed:', error);
      process.exit(1);
    });
} 