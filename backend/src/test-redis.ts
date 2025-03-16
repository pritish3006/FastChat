/**
 * Test script to verify the RedisManager implementation
 * 
 * Run with: npx ts-node src/test-redis.ts
 */

import { RedisManager } from './services/llm/memory/redis';
import { Message } from './services/llm/types';
import { v4 as uuidv4 } from 'uuid';

async function testRedisManager() {
  // Create Redis manager with minimal config
  const redisManager = new RedisManager({
    enabled: true,
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    prefix: 'test-fast-chat:',
    sessionTTL: 3600, // 1 hour
    maxRetries: 3,
    retryTimeout: 1000,
  });

  try {
    console.log('Connecting to Redis...');
    await redisManager.connect();
    console.log('Connected to Redis successfully!');

    // Test generic set method
    const testKey = `test:${uuidv4()}`;
    const testValue = JSON.stringify({ test: 'data', timestamp: Date.now() });
    console.log(`Setting key ${testKey}...`);
    await redisManager.set(testKey, testValue, 60); // 60 second TTL
    
    // Verify it was set correctly
    const client = redisManager.getClient();
    const retrievedValue = await client.get(testKey);
    console.log(`Retrieved value: ${retrievedValue}`);
    console.log(`Set/get test ${retrievedValue === testValue ? 'passed' : 'failed'}`);

    // Test session management
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
    };
    
    console.log(`Creating session ${sessionId}...`);
    await redisManager.setSession(session);
    
    // Retrieve and verify
    const retrievedSession = await redisManager.getSession(sessionId);
    console.log('Retrieved session:', retrievedSession);
    console.log(`Session test ${retrievedSession?.id === sessionId ? 'passed' : 'failed'}`);

    // Test message methods
    const messageId = uuidv4();
    const message: Message = {
      id: messageId,
      sessionId,
      content: 'Test message content',
      role: 'user' as const, // Explicitly typed as 'user'
      timestamp: Date.now(),
      branchId: undefined,
      parentMessageId: undefined,
      version: 1,
      metadata: {
        tokens: 5
      }
    };
    
    console.log(`Adding message ${messageId}...`);
    await redisManager.storeMessage(message);
    
    // Retrieve and verify
    const retrievedMessage = await redisManager.getMessage(messageId);
    console.log('Retrieved message:', retrievedMessage);
    console.log(`Message test ${retrievedMessage?.id === messageId ? 'passed' : 'failed'}`);

    // Clean up
    console.log('Cleaning up...');
    await redisManager.deleteMessage(messageId);
    const deletedMessage = await redisManager.getMessage(messageId);
    console.log(`Message deletion ${deletedMessage === null ? 'passed' : 'failed'}`);
    
    await client.del(`test-fast-chat:session:${sessionId}`);
    
    console.log('Tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Disconnect
    await redisManager.disconnect();
    console.log('Disconnected from Redis');
  }
}

// Run the tests
testRedisManager().catch(console.error); 