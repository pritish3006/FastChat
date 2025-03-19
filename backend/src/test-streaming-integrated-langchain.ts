/**
 * LangChain-focused streaming test
 * 
 * This test demonstrates the improved integration between:
 * - WebSocket streaming
 * - LangChain's streaming capabilities
 * - Redis for state persistence
 * 
 * Run with: npx ts-node src/test-streaming-integrated-langchain.ts
 */

import { StreamingManager } from './services/llm/streaming';
import { RedisManager } from './services/llm/memory/redis';
import { LangChainService } from './services/llm/langchain';
import { WebSocketManager } from './services/llm/langchain/streaming/ws-manager';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { createServer } from 'http';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { HumanMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

// Set log level to info
logger.level = 'info';

// Create a mock WebSocket class for testing
class MockWebSocket extends WebSocket {
  private events: Record<string, Function[]> = {};
  public messages: any[] = [];
  public id: string = uuidv4(); // Add an id property for tracking

  constructor() {
    super('ws://localhost:8080');
    // @ts-ignore - override WebSocket behavior for testing
    this.readyState = 1; // OPEN
  }

  send(data: string | Buffer): void {
    this.messages.push(JSON.parse(data.toString()));
    logger.debug('Received message:', JSON.parse(data.toString()));
  }

  on(event: string, listener: Function): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.events[event] || [];
    listeners.forEach(listener => listener(...args));
    return listeners.length > 0;
  }
}

async function testLangChainStreaming() {
  logger.info('Starting LangChain streaming integration test');

  try {
    // Initialize Redis
    const redisManager = new RedisManager({
      enabled: true,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      prefix: 'streaming-test:',
      sessionTTL: 3600,
    });

    await redisManager.connect();
    logger.info('Redis connected');

    // Initialize StreamingManager
    const streamingManager = new StreamingManager(redisManager);
    logger.info('StreamingManager initialized');

    // Initialize WebSocketManager directly
    const wsManager = new WebSocketManager(redisManager);
    logger.info('WebSocketManager initialized');

    // Create test session
    const sessionId = uuidv4();
    const userId = 'test-user';

    // Create a LangChain model - use Ollama if available, or a fake model
    const modelName = process.env.USE_OLLAMA === 'true' ? 'llama2' : 'gpt-3.5-turbo';
    const modelProvider = process.env.USE_OLLAMA === 'true' 
      ? new ChatOllama({
          baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
          model: modelName,
        })
      : new ChatOpenAI({
          openAIApiKey: 'sk-fake-key',
          streaming: true,
          modelName: 'gpt-3.5-turbo',
        });

    logger.info(`Using model: ${modelName}`);

    // Create LangChain service
    const langchainService = new LangChainService({
      model: {
        provider: process.env.USE_OLLAMA === 'true' ? 'ollama' : 'openai',
        name: modelName,
        temperature: 0.7,
        maxTokens: 1000
      },
      memory: {
        enabled: true,
        sessionId,
        redisManager
      },
      tokenTracking: {
        enabled: true,
        sessionId,
        userId,
        redisManager
      }
    });
    logger.info('LangChain service initialized');

    // Test 1: Direct LangChain Streaming with WebSockets
    logger.info('\n=== Test 1: Direct LangChain Streaming with WebSockets ===');
    
    // Create a WebSocket client
    const ws = new MockWebSocket();
    const connectionId = wsManager.registerConnection(sessionId, ws as any);
    
    // Create a message
    const messageId = uuidv4();
    const question = "Explain the concept of streaming in LLMs in two sentences.";
    
    // Create a LangChain runnable
    const prompt = PromptTemplate.fromTemplate(
      `You are a helpful assistant that provides concise answers.
       
      Question: {question}
      
      Answer:`
    );
    
    // Simple chain: Prompt -> Model -> Output
    const chain = RunnableSequence.from([
      {
        question: (input: { question: string }) => input.question,
      },
      prompt,
      modelProvider,
      new StringOutputParser(),
    ]);
    
    // Stream to WebSocket
    logger.info('Starting WebSocket streaming');
    const streamProgress = await wsManager.streamToWebSocket(
      chain, 
      { question }, 
      connectionId,
      {
        sessionId,
        messageId,
        metadata: { userId }
      }
    );
    
    logger.info('Stream progress:', streamProgress);
    logger.info('Received messages:');
    ws.messages.forEach((msg, i) => {
      logger.info(`  ${i+1}: ${msg.type} ${msg.content || ''}`);
    });
    
    // Test 2: Streaming via StreamingManager
    logger.info('\n=== Test 2: StreamingManager with LangChain Integration ===');
    
    // Create another WebSocket client
    const ws2 = new MockWebSocket();
    streamingManager.registerConnection(sessionId, ws2 as any);
    
    // Create another message
    const messageId2 = uuidv4();
    
    // Stream using the streamLangChainRunnable method
    const progress2 = await streamingManager.streamLangChainRunnable(
      ws2.id,
      sessionId,
      messageId2,
      chain,
      { question: "What are the advantages of using LangChain for LLM applications?" },
      {
        onStart: () => logger.info('Stream started'),
        onToken: (token) => process.stdout.write('.'),
        onComplete: () => logger.info('\nStream completed'),
        onError: (error) => logger.error('Stream error:', error)
      }
    );
    
    logger.info('Stream progress via StreamingManager:', progress2);
    
    // Test 3: Test Express Server with SSE Streaming
    logger.info('\n=== Test 3: Express Server with LangChain SSE Streaming ===');
    
    const app = express();
    const server = createServer(app);
    
    app.get('/test-stream', async (req, res) => {
      // Get a chain from the LangChain service
      const conversationChain = langchainService.getConversationChain({
        systemPrompt: 'You are a helpful assistant that provides short, concise answers.'
      });
      
      // Stream to response
      langchainService.streamChainToResponse(
        conversationChain,
        { question: 'How does SSE streaming work with LangChain?' },
        res,
        { metadata: { sessionId, userId } }
      );
    });
    
    // Start express server
    const port = 3456;
    server.listen(port, () => {
      logger.info(`\nTest server listening at http://localhost:${port}/test-stream`);
      logger.info('Open this URL in your browser to test SSE streaming');
    });
    
    // Wait for manual testing
    logger.info('\nWaiting 30 seconds for manual SSE testing...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Close server
    server.close();
    
    // Cleanup
    await redisManager.disconnect();
    logger.info('\nAll tests completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the tests
testLangChainStreaming().catch(console.error); 