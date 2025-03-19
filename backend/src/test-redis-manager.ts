/**
 * Comprehensive test for the Redis Manager component
 * 
 * This test script verifies the functionality of the RedisManager including:
 * - Connection and initialization
 * - Session management (create, get, update, delete)
 * - Message management (store, retrieve, delete)
 * - TTL expiration handling
 * - Redis lock management
 * - Queue operations
 * 
 * Run with: npx ts-node src/test-redis-manager.ts
 * 
 * Note: Redis must be running on localhost:6379 (or set REDIS_URL env var)
 */

import { RedisManager } from './services/llm/memory/redis';
import { Message, Session } from './services/llm/types';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Helper function to create a test message
function createTestMessage(
  sessionId: string, 
  content: string = 'Test message', 
  role: 'user' | 'assistant' | 'system' = 'user',
  branchId?: string,
  parentMessageId?: string
): Message {
  return {
    id: uuidv4(),
    sessionId,
    content,
    role,
    timestamp: Date.now(),
    branchId,
    parentMessageId,
    version: 1,
    metadata: {
      tokens: content.split(' ').length
    }
  };
}

// Create a new session object
function createTestSession(id: string): Session {
  return {
    id,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    messageCount: 0,
    branches: [],
  };
}

// Main test function
async function testRedisManager() {
  logSection('Redis Manager Component Test');
  
  // Initialize Redis Manager
  logger.info('Initializing Redis Manager...');
  
  const redisManager = new RedisManager({
    enabled: true,
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    prefix: 'test-redis-manager:',
    sessionTTL: 3600, // 1 hour
    maxRetries: 3,
    retryTimeout: 1000,
  });
  
  try {
    // Test 1: Connection
    logSection('Test 1: Connection');
    
    logger.info('Connecting to Redis...');
    await redisManager.connect();
    logger.info('Connected to Redis successfully');
    
    // Test ping
    const pingResult = await redisManager.ping();
    logger.info(`Ping result: ${pingResult ? 'success' : 'failed'}`);
    
    if (!pingResult) {
      throw new Error('Redis ping failed');
    }
    
    // Get Redis client for direct operations
    const client = redisManager.getClient();
    logger.info('Redis client retrieved successfully');
    
    // Test 2: Session Management
    logSection('Test 2: Session Management');
    
    // Create a test session
    const sessionId = `test-session-${uuidv4()}`;
    const session = createTestSession(sessionId);
    
    logger.info(`Creating session: ${sessionId}`);
    await redisManager.setSession(session);
    
    // Retrieve the session
    logger.info('Retrieving session...');
    const retrievedSession = await redisManager.getSession(sessionId);
    
    if (!retrievedSession) {
      throw new Error('Failed to retrieve session');
    }
    
    logger.info(`Retrieved session: ${retrievedSession.id}`);
    logger.info(`Session created at: ${new Date(retrievedSession.createdAt).toISOString()}`);
    
    // Update the session
    retrievedSession.lastAccessedAt = Date.now();
    retrievedSession.messageCount = 5;
    
    logger.info('Updating session...');
    await redisManager.updateSession(sessionId, retrievedSession);
    
    // Retrieve updated session
    const updatedSession = await redisManager.getSession(sessionId);
    logger.info(`Updated session message count: ${updatedSession?.messageCount}`);
    
    // Test 3: Message Management
    logSection('Test 3: Message Management');
    
    // Create test messages
    logger.info('Creating test messages...');
    const message1 = createTestMessage(sessionId, 'This is the first test message');
    const message2 = createTestMessage(sessionId, 'This is the second test message', 'assistant', undefined, message1.id);
    const message3 = createTestMessage(sessionId, 'This is the third test message', 'user', undefined, message2.id);
    
    // Store messages
    logger.info('Storing messages...');
    await redisManager.storeMessage(message1);
    await redisManager.storeMessage(message2);
    await redisManager.storeMessage(message3);
    
    // Retrieve a message
    logger.info(`Retrieving message: ${message2.id}`);
    const retrievedMessage = await redisManager.getMessage(message2.id);
    
    if (!retrievedMessage) {
      throw new Error('Failed to retrieve message');
    }
    
    logger.info(`Retrieved message content: ${retrievedMessage.content}`);
    logger.info(`Message role: ${retrievedMessage.role}`);
    
    // Get messages for session
    logger.info('Retrieving all messages for session...');
    const messages = await redisManager.getMessages(sessionId);
    
    logger.info(`Retrieved ${messages.length} messages for session`);
    messages.forEach((message, i) => {
      logger.info(`Message ${i+1}: ${message.content.substring(0, 30)}... (${message.id})`);
    });
    
    // Test 4: Delete Message
    logSection('Test 4: Message Deletion');
    
    logger.info(`Deleting message: ${message3.id}`);
    await redisManager.deleteMessage(message3.id);
    
    // Verify deletion
    const deletedMessage = await redisManager.getMessage(message3.id);
    logger.info(`Message deletion ${deletedMessage === null ? 'succeeded' : 'failed'}`);
    
    // Get messages again to verify count
    const messagesAfterDeletion = await redisManager.getMessages(sessionId);
    logger.info(`Messages after deletion: ${messagesAfterDeletion.length}`);
    
    // Test 5: Lock Management
    logSection('Test 5: Lock Management');
    
    // Method to test locks
    async function testLock(lockId: string, expectedResult: boolean) {
      logger.info(`Acquiring lock: ${lockId}`);
      const lockResult = await redisManager['acquireLock'](lockId);
      logger.info(`Lock acquired: ${lockResult}`);
      
      if (lockResult !== expectedResult) {
        throw new Error(`Lock acquisition test failed for ${lockId}, expected ${expectedResult}, got ${lockResult}`);
      }
      
      return lockResult;
    }
    
    // First lock should succeed
    const lockId = `lock-test-${uuidv4()}`;
    const firstLock = await testLock(lockId, true);
    
    // Second lock attempt should fail (lock is already held)
    if (firstLock) {
      const secondLock = await testLock(lockId, false);
      
      // Release the lock
      logger.info('Releasing lock...');
      await redisManager['releaseLock'](lockId);
      
      // After release, should be able to acquire again
      const thirdLock = await testLock(lockId, true);
      
      // Clean up
      if (thirdLock) {
        await redisManager['releaseLock'](lockId);
      }
    }
    
    // Test 6: Queue Operations
    logSection('Test 6: Queue Operations');
    
    // Add messages to processing queue
    logger.info('Adding messages to processing queue...');
    await redisManager.addToProcessingQueue(sessionId, message1.id);
    await redisManager.addToProcessingQueue(sessionId, message2.id);
    
    // Get next message from queue
    logger.info('Getting next message from queue...');
    const nextMessage = await redisManager.getNextMessageFromQueue(sessionId);
    logger.info(`Next message in queue: ${nextMessage}`);
    
    if (!nextMessage) {
      throw new Error('Failed to get message from queue');
    }
    
    // Get next message again
    const secondMessage = await redisManager.getNextMessageFromQueue(sessionId);
    logger.info(`Second message in queue: ${secondMessage}`);
    
    // Queue should be empty after two gets
    const emptyQueueResult = await redisManager.getNextMessageFromQueue(sessionId);
    logger.info(`Empty queue result: ${emptyQueueResult === null ? 'queue is empty (expected)' : 'queue still has items'}`);
    
    // Test 7: TTL and Expiration
    logSection('Test 7: TTL and Expiration');
    
    // Create a session with short TTL for testing
    const shortTTLsessionId = `short-ttl-session-${uuidv4()}`;
    const shortTTLsession = createTestSession(shortTTLsessionId);
    
    // Create a Redis manager with very short TTL
    const shortTTLRedisManager = new RedisManager({
      enabled: true,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      prefix: 'test-redis-manager:',
      sessionTTL: 2, // 2 seconds
      maxRetries: 3,
      retryTimeout: 1000,
    });
    
    await shortTTLRedisManager.connect();
    
    // Store session with short TTL
    logger.info('Creating session with 2-second TTL...');
    await shortTTLRedisManager.setSession(shortTTLsession);
    
    // Verify it exists
    const shortTTLretrievedSession = await shortTTLRedisManager.getSession(shortTTLsessionId);
    logger.info(`Short TTL session exists: ${shortTTLretrievedSession !== null}`);
    
    // Wait for expiration
    logger.info('Waiting for TTL expiration (3 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify it's gone
    const expiredSession = await shortTTLRedisManager.getSession(shortTTLsessionId);
    logger.info(`Expired session test: ${expiredSession === null ? 'session expired (expected)' : 'session still exists'}`);
    
    // Disconnect short TTL manager
    await shortTTLRedisManager.disconnect();
    
    // Test 8: KeyPrefix and Key Building
    logSection('Test 8: Key Management');
    
    // Test key building
    const testId = 'test-id-123';
    const sessionKey = redisManager.buildKey('session', testId);
    const messageKey = redisManager.buildKey('messageData', testId);
    
    logger.info(`Session key: ${sessionKey}`);
    logger.info(`Message key: ${messageKey}`);
    
    // Check key exists
    const existingKey = redisManager.buildKey('session', sessionId);
    const nonExistingKey = redisManager.buildKey('session', 'non-existent');
    
    const existingKeyExists = await redisManager.exists(existingKey);
    const nonExistingKeyExists = await redisManager.exists(nonExistingKey);
    
    logger.info(`Existing key exists: ${existingKeyExists}`);
    logger.info(`Non-existing key exists: ${nonExistingKeyExists}`);
    
    // Test 9: Cleanup
    logSection('Test 9: Cleanup');
    
    // Delete test data
    logger.info('Deleting test session...');
    const sessionKey9 = redisManager.buildKey('session', sessionId);
    await client.del(sessionKey9);
    
    // Delete remaining messages
    logger.info('Deleting test messages...');
    await redisManager.deleteMessage(message1.id);
    await redisManager.deleteMessage(message2.id);
    
    // Delete all testing keys
    const allKeys = await client.keys(`${redisManager['keyPrefix']}*`);
    logger.info(`Found ${allKeys.length} remaining test keys`);
    
    if (allKeys.length > 0) {
      logger.info('Deleting all remaining test keys...');
      await client.del(...allKeys);
    }
    
    // Disconnect from Redis
    logger.info('Disconnecting from Redis...');
    await redisManager.disconnect();
    logger.info('Redis connection closed');
    
    logSection('All Tests Completed Successfully');
    
  } catch (error) {
    logger.error('Test failed:', error);
    
    // Attempt to disconnect even if tests fail
    try {
      await redisManager.disconnect();
    } catch (e) {
      logger.error('Error during Redis disconnect:', e);
    }
  }
}

// Run the tests
testRedisManager().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 