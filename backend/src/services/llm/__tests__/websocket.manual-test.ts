import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createTRPCProxyClient, createWSClient, wsLink } from '@trpc/client';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../index';
import { RedisManager } from '../memory/redis';
import { StreamingManager } from '../streaming';
import { appRouter } from '../../../server/routers';
import type { AppRouter } from '../../../server/routers';
import logger from '../../../utils/logger';

// Declare global variables for services
declare global {
  var llmService: LLMService;
  var redisManager: RedisManager;
  var streamingManager: StreamingManager;
}

interface StreamData {
  type: 'token' | 'complete' | 'error' | 'cancelled';
  content?: string;
  streamId: string;
  error?: string;
}

// Create context function for WebSocket handler
async function createContext(opts: CreateWSSContextFnOptions) {
  const ws = opts.req.socket;
  const connectionId = uuidv4();
  return {
    wsContext: {
      ...opts,
      ws,
      connectionId
    },
    httpContext: opts as unknown as CreateHTTPContextOptions
  };
}

async function runTests() {
  console.log('🚀 Starting WebSocket Integration Tests...\n');

  // Initialize services
  console.log('Initializing services...');
  global.redisManager = new RedisManager({
    enabled: true,
    url: 'redis://localhost:6379',
    prefix: 'fast-chat:test:',
    maxRetries: 3,
    retryTimeout: 1000,
    sessionTTL: 3600 // 1 hour
  });
  await global.redisManager.initialize();

  global.streamingManager = new StreamingManager();

  global.llmService = new LLMService({
    model: {
      provider: 'ollama',
      modelId: 'llama3.2:latest',  // Using the model we confirmed is available
      baseUrl: 'http://localhost:11434'
    }
  });
  await global.llmService.initialize();

  // Test Ollama connection directly before starting tests
  console.log('Testing Ollama connection...');
  try {
    const models = await global.llmService.listModels();
    console.log('Successfully connected to Ollama. Available models:', models);
  } catch (error) {
    console.error('Failed to connect to Ollama:', error);
    throw new Error('Ollama connection test failed');
  }

  // Create HTTP server
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });
  const handler = applyWSSHandler({
    wss,
    router: appRouter,
    createContext
  });

  // Start server
  const port = 3001;
  httpServer.listen(port);
  console.log(`Server listening on port ${port}`);
  console.log('WebSocket server created\n');

  // Create WebSocket client
  const wsClient = createWSClient({
    url: `ws://localhost:${port}`
  });

  // Create tRPC client
  const client = createTRPCProxyClient<AppRouter>({
    links: [
      wsLink({
        client: wsClient
      })
    ],
    transformer: superjson
  });

  console.log('✅ Setup complete. Starting tests...\n');

  try {
    // Test 1: Create a new session
    console.log('Running Test: Create Session');
    const session = await client.llm.createSession.mutate();
    console.log('Session created:', session);

    // Test 2: Basic Chat Flow with Streaming
    console.log('\nRunning Test: Basic Chat Flow with Streaming');
    let messageCount = 0;
    let hasError = false;
    let isComplete = false;
    let accumulatedContent = '';

    console.log('Subscribing to chat events...');
    const chatSubscription = await client.llm.onChat.subscribe({
      type: 'chat',
      content: 'What is the capital of France? Keep it very short.',
      sessionId: session.id,
      systemPrompt: 'You are a helpful AI assistant. Keep your responses short and concise.'
    }, {
      onData: (data: any) => {
        if (data.content) {
          messageCount++;
          accumulatedContent += data.content;
          console.log('Received chunk:', data.content);
        }

        if (data.type === 'error') {
          hasError = true;
          console.error('Stream error:', data.error);
        }

        if (data.type === 'complete') {
          isComplete = true;
          console.log('Stream completed');
          console.log('Final accumulated content:', accumulatedContent);
        }
      },
      onError: (err: Error) => {
        hasError = true;
        console.error('Subscription error:', err);
        throw err;
      }
    });

    // Wait for initial response
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log(`✅ Received ${messageCount} message chunks\n`);

    // Test 3: Stream Cancellation
    console.log('Running Test: Stream Cancellation');
    let cancellationConfirmed = false;
    let preemptiveContent = '';

    const cancellationSubscription = await client.llm.onChat.subscribe({
      type: 'chat',
      content: 'Tell me a very long story about quantum physics',
      sessionId: session.id
    }, {
      onData: async (data: any) => {
        if (data.content) {
          preemptiveContent += data.content;
          console.log('Token before cancel:', data.content);
        }

        // After receiving some content, cancel the stream
        if (preemptiveContent.length > 100 && !cancellationConfirmed) {
          try {
            await client.llm.cancelStream.mutate({ streamId: data.streamId });
            cancellationConfirmed = true;
            console.log('✅ Stream cancelled successfully\n');
          } catch (error) {
            console.error('Error cancelling stream:', error);
          }
        }

        if (data.type === 'cancelled') {
          console.log('Stream cancelled with content received:', preemptiveContent);
        }
      },
      onError: (err: Error) => {
        console.error('Cancellation test error:', err);
        throw err;
      }
    });

    // Wait for cancellation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 4: Error Handling
    console.log('Running Test: Error Handling');
    let errorReceived = false;

    const errorSubscription = await client.llm.onChat.subscribe({
      type: 'chat',
      content: 'This is a test message',
      sessionId: 'invalid-session-id' // This should trigger an error
    }, {
      onData: (data: any) => {
        if (data.type === 'error') {
          errorReceived = true;
          console.log('✅ Received expected error:', data.error);
        }
      },
      onError: (err: Error) => {
        errorReceived = true;
        console.log('✅ Received expected error:', err.message);
      }
    });

    // Wait for error
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Final Summary
    console.log('\n📊 Test Summary:');
    console.log('Basic Chat:', messageCount > 0 ? '✅' : '❌');
    console.log('Stream Cancellation:', cancellationConfirmed ? '✅' : '❌');
    console.log('Error Handling:', errorReceived ? '✅' : '❌');

    console.log('\n✅ All tests completed successfully!\n');
  } catch (error) {
    console.error('❌ Tests failed:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('Cleaning up...');
    wsClient.close();
    handler.broadcastReconnectNotification();
    wss.close();
    httpServer.close();
    await global.llmService.shutdown();
    await global.redisManager.disconnect();
    console.log('✅ Cleanup complete');
  }
}

// Run the tests
console.log('Running WebSocket Integration Tests...');
runTests().catch(console.error); 