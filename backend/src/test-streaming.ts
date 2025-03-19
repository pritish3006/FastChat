/**
 * Test script to verify the StreamingManager implementation
 * 
 * Run with: npx ts-node src/test-streaming.ts
 * 
 * To test with Redis: REDIS_URL=redis://localhost:6379 npx ts-node src/test-streaming.ts
 */

import { StreamingManager, StreamProgress } from './services/llm/streaming';
import { RedisManager } from './services/llm/memory/redis';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

// Mock WebSocket class for testing
class MockWebSocket extends EventEmitter {
  private messages: any[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data));
    console.log(`WebSocket sent: ${data}`);
  }

  getMessages(): any[] {
    return this.messages;
  }

  simulateClose(): void {
    this.emit('close');
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

// Create async generator for tokens
async function* createTokenGenerator(tokens: string[], options: {
  delay?: number;
  throwError?: boolean;
  errorAt?: number;
} = {}): AsyncGenerator<string, void, unknown> {
  const { delay = 50, throwError = false, errorAt } = options;
  
  for (let i = 0; i < tokens.length; i++) {
    if (throwError && errorAt !== undefined && i === errorAt) {
      throw new Error('Simulated token generation error');
    }
    
    // Simulate processing time
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    yield tokens[i];
  }
}

// Generate a large array of tokens for performance testing
function generateLargeTokenArray(size = 1000): string[] {
  const result: string[] = [];
  const words = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', ',', '.', '!', '?'];
  
  for (let i = 0; i < size; i++) {
    // Add words and spaces to simulate real text
    const word = words[Math.floor(Math.random() * words.length)];
    result.push(word);
    
    // Add space after every word except punctuation
    if (![',', '.', '!', '?'].includes(word)) {
      result.push(' ');
      i++; // Count the space as a token
    }
  }
  
  return result;
}

// Create a RedisManager instance for testing
async function createRedisManager(): Promise<RedisManager | null> {
  // Check if Redis URL is provided
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('Redis URL not provided. Redis tests will be skipped.');
    return null;
  }
  
  try {
    const redisManager = new RedisManager({
      enabled: true,
      url: redisUrl,
      prefix: 'test-streaming:',
      sessionTTL: 3600,
      maxRetries: 2,
      retryTimeout: 500,
    });
    
    await redisManager.connect();
    return redisManager;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

// Format number with commas for readability
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function testStreamingManager() {
  // Create StreamingManager with no Redis for simplicity
  const streamingManager = new StreamingManager();
  const sessionId = uuidv4();
  const messageId = uuidv4();
  
  console.log('=== StreamingManager Test ===');
  
  // Test 1: Connection Registration
  console.log('\n--- Test 1: Connection Registration ---');
  const ws1 = new MockWebSocket();
  const connectionId = streamingManager.registerConnection(sessionId, ws1 as any);
  console.log(`Connection registered with ID: ${connectionId}`);
  console.assert(connectionId.length > 0, 'Should receive a valid connection ID');
  
  // Test 2: Basic Streaming
  console.log('\n--- Test 2: Basic Streaming ---');
  const tokens = ['Hello', ' ', 'world', '!', ' ', 'This', ' ', 'is', ' ', 'a', ' ', 'test', '.'];
  
  try {
    const generator = createTokenGenerator(tokens, { delay: 100 });
    
    // Wrap in a promise to capture the result
    const streamPromise = streamingManager.streamResponse(
      connectionId,
      sessionId,
      messageId,
      generator,
      {
        onStart: () => console.log('Stream started'),
        onToken: (token) => console.log(`Token received: "${token}"`),
        onComplete: () => console.log('Stream completed'),
        onError: (error) => console.log('Stream error:', error.message)
      }
    );
    
    // Wait for streaming to complete
    const progress = await streamPromise;
    console.log('Stream progress:', progress);
    
    // Verify messages sent to WebSocket
    const messages = ws1.getMessages();
    console.log(`Received ${messages.length} messages`);
    console.assert(messages.length >= tokens.length + 2, 'Should have received all tokens plus start/end messages');
    
    const startMessage = messages.find(m => m.type === 'stream_start');
    const endMessage = messages.find(m => m.type === 'stream_end');
    
    console.assert(startMessage !== undefined, 'Should have received a stream_start message');
    console.assert(endMessage !== undefined, 'Should have received a stream_end message');
    console.assert(progress.status === 'completed', 'Stream should be marked as completed');
    console.assert(progress.tokenCount === tokens.length, 'Token count should match the number of tokens sent');
    
    console.log('Basic streaming test passed!');
  } catch (error) {
    console.error('Basic streaming test failed:', error);
  }
  
  // Test 3: Cancellation
  console.log('\n--- Test 3: Cancellation ---');
  const longTokens = Array(20).fill(0).map((_, i) => `token${i+1}`);
  
  try {
    // Use longer delay to ensure we have time to cancel
    const generator = createTokenGenerator(longTokens, { delay: 200 });
    const ws2 = new MockWebSocket();
    const conn2 = streamingManager.registerConnection(sessionId, ws2 as any);
    
    // Start streaming in background
    const streamPromise = streamingManager.streamResponse(
      conn2,
      sessionId,
      uuidv4(), // New message ID
      generator,
      {
        onStart: () => console.log('Long stream started'),
        onToken: (token) => console.log(`Long token: "${token}"`),
        onComplete: () => console.log('Long stream completed'),
        onError: (error) => console.log('Long stream error:', error.message)
      }
    );
    
    // Wait a bit and then cancel
    await new Promise(resolve => setTimeout(resolve, 800)); // Wait for ~4 tokens
    
    // Get active streams and cancel the first one
    const activeStreams = streamingManager.getAllActiveStreams();
    const activeStreamId = [...activeStreams.keys()][0];
    console.log(`Cancelling stream: ${activeStreamId}`);
    
    const cancelled = await streamingManager.cancelStream(activeStreamId);
    console.log(`Stream cancelled: ${cancelled}`);
    
    // Wait for streaming to complete or cancel
    const progress = await streamPromise;
    console.log('Cancelled stream progress:', progress);
    
    console.assert(progress.status === 'cancelled', 'Stream should be marked as cancelled');
    console.assert(progress.tokenCount < longTokens.length, 'Token count should be less than total tokens');
    
    const messages = ws2.getMessages();
    const cancelMessage = messages.find(m => m.type === 'stream_cancelled');
    console.assert(cancelMessage !== undefined, 'Should have received a stream_cancelled message');
    
    console.log('Cancellation test passed!');
  } catch (error) {
    console.error('Cancellation test failed:', error);
  }
  
  // Test 4: Error Handling
  console.log('\n--- Test 4: Error Handling ---');
  
  try {
    // Generate error after 3 tokens
    const generator = createTokenGenerator(['This', ' ', 'will', ' ', 'error'], { 
      delay: 100, 
      throwError: true, 
      errorAt: 3 
    });
    
    const ws3 = new MockWebSocket();
    const conn3 = streamingManager.registerConnection(sessionId, ws3 as any);
    
    const streamPromise = streamingManager.streamResponse(
      conn3,
      sessionId,
      uuidv4(),
      generator,
      {
        onStart: () => console.log('Error test stream started'),
        onToken: (token) => console.log(`Error test token: "${token}"`),
        onComplete: () => console.log('Error test stream completed'),
        onError: (error) => console.log('Error test stream error:', error.message)
      }
    );
    
    const progress = await streamPromise;
    console.log('Error stream progress:', progress);
    
    console.assert(progress.status === 'error', 'Stream should be marked as error');
    console.assert(progress.error !== undefined, 'Stream should have error message');
    
    const messages = ws3.getMessages();
    const errorMessage = messages.find(m => m.type === 'stream_error');
    console.assert(errorMessage !== undefined, 'Should have received a stream_error message');
    
    console.log('Error handling test passed!');
  } catch (error) {
    console.error('Error handling test failed:', error);
  }
  
  // Test 5: Connection Closure
  console.log('\n--- Test 5: Connection Closure ---');
  
  try {
    const ws4 = new MockWebSocket();
    const conn4 = streamingManager.registerConnection(sessionId, ws4 as any);
    
    // Start a stream
    const tokens = ['Connection', ' ', 'will', ' ', 'close', ' ', 'soon'];
    const generator = createTokenGenerator(tokens, { delay: 200 });
    
    const streamPromise = streamingManager.streamResponse(
      conn4,
      sessionId,
      uuidv4(),
      generator
    );
    
    // Wait a bit then close the connection
    await new Promise(resolve => setTimeout(resolve, 600)); // Wait for ~3 tokens
    console.log('Simulating connection close...');
    ws4.simulateClose();
    
    // Give some time for cleanup to happen
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Check if the stream was properly cleaned up
    const activeStreams = streamingManager.getAllActiveStreams();
    console.log(`Active streams after connection close: ${activeStreams.size}`);
    
    // The stream promise should still resolve
    const progress = await streamPromise;
    console.log('Connection closure stream progress:', progress);
    
    console.log('Connection closure test completed');
  } catch (error) {
    console.error('Connection closure test failed:', error);
  }
  
  // Test 6: Redis Support (if available)
  console.log('\n--- Test 6: Redis Support ---');
  
  try {
    const redisManager = await createRedisManager();
    if (!redisManager) {
      console.log('Skipping Redis tests - Redis not available');
    } else {
      console.log('Redis connected successfully');
      
      // Create a StreamingManager with Redis
      const redisStreamingManager = new StreamingManager(redisManager);
      
      // Test streaming with Redis persistence
      const ws5 = new MockWebSocket();
      const conn5 = redisStreamingManager.registerConnection(sessionId, ws5 as any);
      
      const tokens = ['Redis', ' ', 'test', ' ', 'message'];
      const generator = createTokenGenerator(tokens, { delay: 50 });
      
      console.log('Starting stream with Redis persistence...');
      const streamPromise = redisStreamingManager.streamResponse(
        conn5,
        sessionId,
        uuidv4(),
        generator
      );
      
      const progress = await streamPromise;
      console.log('Redis stream progress:', progress);
      
      // Verify data was stored in Redis
      const key = `test-streaming:stream:${progress.requestId}`;
      const storedData = await redisManager.getClient().get(key);
      
      console.log('Data stored in Redis:', storedData ? 'Yes' : 'No');
      console.assert(storedData !== null, 'Stream progress should be stored in Redis');
      
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        console.assert(parsedData.status === 'completed', 'Stored stream should be marked as completed');
        console.assert(parsedData.tokenCount === tokens.length, 'Stored token count should match tokens sent');
      }
      
      // Clean up Redis
      await redisManager.getClient().del(key);
      await redisManager.disconnect();
      
      console.log('Redis test completed successfully');
    }
  } catch (error) {
    console.error('Redis test failed:', error);
  }

  // Test 7: Performance Testing - High Volume
  console.log('\n--- Test 7: Performance Testing (High Volume) ---');
  
  try {
    // Generate 1,000 tokens
    const largeTokenArray = generateLargeTokenArray(1000);
    console.log(`Generated ${formatNumber(largeTokenArray.length)} tokens for performance test`);
    
    // Silent WebSocket to avoid flooding the console
    class SilentWebSocket extends EventEmitter {
      private counter = 0;
      send(data: string): void { this.counter++; }
      getCounter(): number { return this.counter; }
    }
    
    const silentWs = new SilentWebSocket();
    const perfConnId = streamingManager.registerConnection(sessionId, silentWs as any);
    
    // No delay for performance testing
    const generator = createTokenGenerator(largeTokenArray, { delay: 0 });
    
    console.log('Starting high-volume stream...');
    const startTime = performance.now();
    
    const progress = await streamingManager.streamResponse(
      perfConnId,
      sessionId,
      uuidv4(),
      generator
    );
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const tokensPerSecond = Math.round((largeTokenArray.length / duration) * 1000);
    
    console.log(`Processed ${formatNumber(largeTokenArray.length)} tokens in ${duration.toFixed(2)}ms`);
    console.log(`Throughput: ${formatNumber(tokensPerSecond)} tokens/second`);
    console.assert(progress.tokenCount === largeTokenArray.length, 'All tokens should be processed');
    
    console.log('High volume test completed successfully');
  } catch (error) {
    console.error('High volume test failed:', error);
  }
  
  // Test 8: Performance Testing - Concurrent Streams
  console.log('\n--- Test 8: Performance Testing (Concurrent Streams) ---');
  
  try {
    const numStreams = 5;
    const tokensPerStream = 200;
    console.log(`Testing ${numStreams} concurrent streams with ${tokensPerStream} tokens each`);
    
    const streams = [];
    const startTime = performance.now();
    
    // Create multiple concurrent streams
    for (let i = 0; i < numStreams; i++) {
      const silentWs = new MockWebSocket();
      const connId = streamingManager.registerConnection(sessionId, silentWs as any);
      
      const tokens = generateLargeTokenArray(tokensPerStream);
      const generator = createTokenGenerator(tokens, { delay: 0 });
      
      const streamPromise = streamingManager.streamResponse(
        connId,
        sessionId,
        uuidv4(),
        generator
      );
      
      streams.push(streamPromise);
    }
    
    // Wait for all streams to complete
    console.log('Waiting for all streams to complete...');
    const results = await Promise.all(streams);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const totalTokens = tokensPerStream * numStreams;
    const tokensPerSecond = Math.round((totalTokens / duration) * 1000);
    
    console.log(`Processed ${formatNumber(totalTokens)} tokens across ${numStreams} streams in ${duration.toFixed(2)}ms`);
    console.log(`Aggregate throughput: ${formatNumber(tokensPerSecond)} tokens/second`);
    
    // Verify all streams completed successfully
    const allCompleted = results.every(p => p.status === 'completed');
    console.assert(allCompleted, 'All streams should complete successfully');
    
    const totalProcessed = results.reduce((sum, p) => sum + p.tokenCount, 0);
    console.assert(totalProcessed === totalTokens, 'All tokens should be processed across all streams');
    
    console.log('Concurrent streams test completed successfully');
  } catch (error) {
    console.error('Concurrent streams test failed:', error);
  }
  
  // Test 2.5: Content Accumulation
  console.log('\n--- Test 2.5: Content Accumulation ---');
  const accumulationMessageId = uuidv4();
  const accWs = new MockWebSocket();
  const accConnectionId = streamingManager.registerConnection(sessionId, accWs as any);
  
  try {
    const accTokens = ['This', ' is', ' content', ' that', ' should', ' be', ' accumulated', '.'];
    const accGenerator = createTokenGenerator(accTokens, { delay: 50 });
    
    console.log('Streaming tokens for content accumulation test...');
    const accProgress = await streamingManager.streamResponse(
      accConnectionId,
      sessionId,
      accumulationMessageId,
      accGenerator,
      { 
        onStart: () => console.log('Accumulation test started'),
        onToken: () => process.stdout.write('.'),
        onComplete: () => console.log('\nAccumulation test completed')
      }
    );
    
    // Test content retrieval by requestId
    const contentByRequestId = streamingManager.getStreamContent(accProgress.requestId);
    console.log(`\nContent by requestId: "${contentByRequestId}"`);
    console.assert(contentByRequestId === accTokens.join(''), 
      'Content by requestId should match expected content');
    
    // Test content retrieval by messageId
    const contentByMessageId = streamingManager.getContentByMessageId(accumulationMessageId);
    console.log(`Content by messageId: "${contentByMessageId}"`);
    console.assert(contentByMessageId === accTokens.join(''), 
      'Content by messageId should match expected content');
    
    // Test resource cleanup
    console.log('Testing resource cleanup...');
    streamingManager.cleanupMessageResources(accumulationMessageId);
    
    // Verify content is no longer available
    const contentAfterCleanup = streamingManager.getContentByMessageId(accumulationMessageId);
    console.log(`Content after cleanup: ${contentAfterCleanup === null ? 'null (expected)' : 'still present (unexpected)'}`);
    console.assert(contentAfterCleanup === null, 'Content should be null after cleanup');
    
    console.log('Content accumulation test completed successfully!');
  } catch (error) {
    console.error('Content accumulation test failed:', error);
  }
  
  console.log('\n=== All Tests Completed ===');
}

// Run the tests
testStreamingManager().catch(console.error); 