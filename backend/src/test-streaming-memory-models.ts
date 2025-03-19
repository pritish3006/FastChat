/**
 * Full integration test for streaming with memory and model services
 * 
 * This test demonstrates the integration between:
 * - Streaming capabilities (WebSocket and SSE)
 * - Memory services (MemoryManager, context assembly, branching)
 * - Model providers (Ollama with fallback)
 * 
 * Run with: npx ts-node src/test-streaming-memory-models.ts
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { RedisManager } from './services/llm/memory/redis';
import { MemoryManager } from './services/llm/memory';
import { MemoryConfig } from './services/llm/memory/config';
import { ContextManager } from './services/llm/memory/context';
import { BranchManager } from './services/llm/memory/branch';
import { StreamingManager } from './services/llm/streaming';
import { ModelProviderFactory } from './services/llm/providers';
import { ollamaService } from './services/llm/ollama';
import { ModelConfig, Message, StreamController } from './services/llm/types';
import logger from './utils/logger';

// Set log level to info
logger.level = 'info';

// Mock WebSocket class for testing
class MockWebSocket extends EventEmitter {
  public messages: any[] = [];
  public content: string = '';
  public id: string = uuidv4(); // Add an id property for tracking

  constructor() {
    super();
    // @ts-ignore - override WebSocket behavior for testing
    this.readyState = WebSocket.OPEN;
  }

  send(data: string): void {
    const parsed = JSON.parse(data);
    this.messages.push(parsed);
    
    // Process message based on type
    if (parsed.type === 'token' && parsed.content) {
      this.content += parsed.content;
      // Display the actual token instead of a dot
      process.stdout.write(parsed.content);
    } else if (parsed.type === 'stream_start') {
      logger.info('Stream started');
      process.stdout.write('\n');
    } else if (parsed.type === 'stream_end') {
      process.stdout.write('\n');
      logger.info('Stream ended');
    }
  }

  // Helper method to clear state for new tests
  clear(): void {
    this.messages = [];
    this.content = '';
  }
}

// Helper function to format section headers
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80) + '\n');
}

/**
 * Create a message object
 */
function createMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, branchId?: string): Message {
  return {
    id: uuidv4(),
    sessionId,
    role,
    content,
    timestamp: Date.now(),
    version: 1,
    branchId,
    metadata: {
      tokens: Math.ceil(content.length / 4), // Rough approximation
    }
  };
}

/**
 * Convert a stream controller to an AsyncIterable for StreamingManager
 */
async function* streamToAsyncIterable(stream: StreamController): AsyncGenerator<string> {
  // Create a Promise that will be resolved when a chunk is received
  let resolver: ((value: string | null) => void) | null = null;
  let rejecter: ((reason: Error) => void) | null = null;
  let buffer: string[] = [];
  let done = false;
  let error: Error | null = null;

  // Set up event handlers
  stream.on('chunk', (chunk: { text: string }) => {
    if (chunk.text) {
      buffer.push(chunk.text);
      if (resolver) {
        const resolve = resolver;
        resolver = null;
        resolve(buffer.shift() || '');
      }
    }
  });

  stream.on('done', () => {
    done = true;
    if (resolver) {
      const resolve = resolver;
      resolver = null;
      if (buffer.length > 0) {
        resolve(buffer.shift() || '');
      } else {
        resolve(null);
      }
    }
  });

  stream.on('error', (err: Error) => {
    error = err;
    if (rejecter) {
      const reject = rejecter;
      rejecter = null;
      reject(err);
    }
  });

  // Yield chunks as they come in
  while (!done || buffer.length > 0) {
    if (error) throw error;

    if (buffer.length > 0) {
      yield buffer.shift() || '';
    } else if (!done) {
      const nextChunk = await new Promise<string | null>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
      });
      
      if (nextChunk === null) break;
      yield nextChunk;
    } else {
      break;
    }
  }
}

/**
 * Main test function
 */
async function testStreamingWithMemoryAndModels() {
  logSection('STREAMING WITH MEMORY AND MODELS INTEGRATION TEST');
  
  try {
    // STEP 1: Initialize all services
    logger.info('Initializing services...');
    
    // 1.1 Initialize Redis Manager
    const redisManager = new RedisManager({
      enabled: true,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      prefix: 'full-integration-test:',
      sessionTTL: 3600,
    });
    
    await redisManager.connect();
    logger.info('Redis connected');
    
    // 1.2 Initialize Memory Manager
    const memoryConfig: MemoryConfig = {
      redis: {
        enabled: true,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        prefix: 'full-integration-test:',
        sessionTTL: 3600
      },
      database: {
        enabled: false,
        type: 'supabase', 
        url: '',
        key: ''
      },
      defaults: {
        maxContextSize: 50,
        sessionTTL: 3600,
        maxMessageSize: 32 * 1024, // 32KB
        contextWindowPercentage: 80 // Use 80% of context window
      }
    };
    
    const memoryManager = new MemoryManager(memoryConfig);
    await memoryManager.initialize();
    logger.info('Memory manager initialized');
    
    // Get managers for easier access
    const contextManager = memoryManager.getContextManager();
    const branchManager = memoryManager.getBranchManager();
    
    // 1.3 Initialize Streaming Manager
    const streamingManager = new StreamingManager(redisManager);
    logger.info('Streaming manager initialized');
    
    // 1.4 Get available models from Ollama
    logger.info('Fetching available models from Ollama...');
    const models = await ollamaService.listModels();
    
    if (models.length === 0) {
      throw new Error('No models available in Ollama. Please pull a model first.');
    }
    
    logger.info(`Found ${models.length} models:`);
    models.forEach((model, index) => {
      logger.info(`  ${index + 1}. ${model.name} (${model.details.family}, ${model.details.parameter_size})`);
    });
    
    // Select first model
    const selectedModel = models[0];
    logger.info(`Selected model: ${selectedModel.name}`);
    
    // 1.5 Initialize model provider
    const modelConfig: ModelConfig = {
      provider: 'ollama',
      modelId: selectedModel.name,
      baseUrl: ollamaService.baseUrl,
      temperature: 0.7
    };
    
    const modelProvider = await ModelProviderFactory.getProvider(modelConfig);
    logger.info('Model provider initialized');
    
    // STEP 2: Create session and WebSocket
    logSection('SESSION AND CONNECTION SETUP');
    
    const sessionId = uuidv4();
    logger.info(`Created new session with ID: ${sessionId}`);
    
    // Create WebSocket
    const ws = new MockWebSocket();
    const connectionId = streamingManager.registerConnection(sessionId, ws as any);
    logger.info(`Registered WebSocket connection with ID: ${connectionId}`);
    
    // STEP 3: Test basic streaming with memory integration
    logSection('TEST 1: BASIC STREAMING WITH MEMORY');
    
    // Create first user message
    const firstQuestion = "Who was Chandragupta Maurya?";
    logger.info(`User question: "${firstQuestion}"`);
    
    // Store message in memory
    const userMessage1 = createMessage(sessionId, 'user', firstQuestion);
    await memoryManager.storeMessage(userMessage1);
    logger.info(`Stored user message in memory with ID: ${userMessage1.id}`);
    
    // Prepare assistant message shell (will be filled with streaming content)
    const assistantMessage1 = createMessage(sessionId, 'assistant', '');
    
    // Get model response with streaming
    logger.info('Getting streaming response from model...');
    
    // Generate streaming response
    const streamController = await modelProvider.generateChatCompletion({
      messages: [{ role: 'user', content: firstQuestion }],
      stream: true
    }) as StreamController;
    
    // Convert the stream controller to an AsyncIterable for StreamingManager
    const asyncStream = streamToAsyncIterable(streamController);
    
    // Stream the response
    const progress = await streamingManager.streamResponse(
      connectionId,
      sessionId,
      assistantMessage1.id,
      asyncStream,
      {
        onStart: () => logger.info('Stream started'),
        onComplete: () => logger.info('Stream completed')
      }
    );
    
    // Get the accumulated content from the stream
    const accumulatedContent = streamingManager.getStreamContent(progress.requestId);
    if (!accumulatedContent) {
      throw new Error('Failed to accumulate content from stream');
    }
    
    // Update assistant message with content and store it
    assistantMessage1.content = accumulatedContent;
    await memoryManager.storeMessage(assistantMessage1);
    logger.info(`Stored assistant message in memory with ID: ${assistantMessage1.id}`);
    
    // STEP 4: Test context assembly for follow-up questions
    logSection('TEST 2: FOLLOW-UP QUESTION WITH CONTEXT');
    
    // Reset the WebSocket for the next test
    ws.clear();
    
    // Create follow-up question
    const followUpQuestion = "Tell me about his predecessor and enemies.";
    logger.info(`Follow-up question: "${followUpQuestion}"`);
    
    // Store follow-up message in memory
    const userMessage2 = createMessage(sessionId, 'user', followUpQuestion);
    await memoryManager.storeMessage(userMessage2);
    
    // Assemble context from previous conversation
    const context = await contextManager.assembleContext(sessionId, {
      maxMessages: 10
    });
    
    logger.info(`Assembled context with ${context.messages.length} messages`);
    
    // Format messages for the model with context
    const modelMessages = context.messages.map(msg => ({
      role: msg.role, 
      content: msg.content
    }));
    
    // Add the new question
    modelMessages.push({ role: 'user', content: followUpQuestion });
    
    // Prepare assistant message shell for the response
    const assistantMessage2 = createMessage(sessionId, 'assistant', '');
    
    // Get streaming response for follow-up with context
    logger.info('Getting streaming response for follow-up question...');
    
    const contextStreamController = await modelProvider.generateChatCompletion({
      messages: modelMessages,
      stream: true
    }) as StreamController;
    
    // Convert to AsyncIterable
    const contextAsyncStream = streamToAsyncIterable(contextStreamController);
    
    // Stream the response
    const followUpProgress = await streamingManager.streamResponse(
      connectionId,
      sessionId,
      assistantMessage2.id,
      contextAsyncStream,
      {
        onStart: () => logger.info('Follow-up stream started'),
        onComplete: () => logger.info('Follow-up stream completed')
      }
    );
    
    // Get the accumulated content
    const followUpContent = streamingManager.getStreamContent(followUpProgress.requestId);
    if (!followUpContent) {
      throw new Error('Failed to accumulate content from follow-up stream');
    }
    
    // Update and store the assistant message
    assistantMessage2.content = followUpContent;
    await memoryManager.storeMessage(assistantMessage2);
    
    // STEP 5: Test branching with streaming
    logSection('TEST 3: CONVERSATION BRANCHING');
    
    // Reset the WebSocket for the next test
    ws.clear();
    
    // Create a branch from the first assistant message
    logger.info('Creating a branch from the first response...');
    const branch = await branchManager.createBranch(
      sessionId,
      assistantMessage1.id,
      {
        name: "Alternate history branch"
      }
    );
    
    logger.info(`Created branch with ID: ${branch.id}`);
    
    // Ask an alternate follow-up in the branch
    const branchQuestion = "What if Chandragupta never founded the Mauryan Empire?";
    logger.info(`Branch question: "${branchQuestion}"`);
    
    // Store branch message
    const branchUserMessage = createMessage(sessionId, 'user', branchQuestion, branch.id);
    await memoryManager.storeMessage(branchUserMessage);
    
    // Assemble context for the branch
    const branchContext = await contextManager.assembleContext(sessionId, {
      branchId: branch.id,
      maxMessages: 10
    });
    
    logger.info(`Assembled branch context with ${branchContext.messages.length} messages`);
    
    // Format messages for the model
    const branchModelMessages = branchContext.messages.map(msg => ({
      role: msg.role, 
      content: msg.content
    }));
    
    // Add the new branch question
    branchModelMessages.push({ role: 'user', content: branchQuestion });
    
    // Prepare assistant message for the branch response
    const branchAssistantMessage = createMessage(
      sessionId, 
      'assistant', 
      '', 
      branch.id
    );
    
    // Get streaming response for branch question
    logger.info('Getting streaming response for branch question...');
    
    const branchStreamController = await modelProvider.generateChatCompletion({
      messages: branchModelMessages,
      stream: true
    }) as StreamController;
    
    // Convert to AsyncIterable
    const branchAsyncStream = streamToAsyncIterable(branchStreamController);
    
    // Stream the branch response
    const branchProgress = await streamingManager.streamResponse(
      connectionId,
      sessionId,
      branchAssistantMessage.id,
      branchAsyncStream,
      {
        onStart: () => logger.info('Branch stream started'),
        onComplete: () => logger.info('Branch stream completed')
      }
    );
    
    // Get the accumulated branch content
    const branchContent = streamingManager.getStreamContent(branchProgress.requestId);
    if (!branchContent) {
      throw new Error('Failed to accumulate content from branch stream');
    }
    
    // Update and store the branch assistant message
    branchAssistantMessage.content = branchContent;
    await memoryManager.storeMessage(branchAssistantMessage);
    
    // STEP 6: List all branches and messages to verify persistence
    logSection('TEST 4: VERIFY PERSISTENCE');
    
    // List all branches
    const branches = await branchManager.getBranches(sessionId);
    logger.info(`Found ${branches.length} branches for session ${sessionId}`);
    
    for (const b of branches) {
      logger.info(`Branch: ${b.name || 'unnamed'} (${b.id}), isActive: ${b.isActive}`);
      
      // Get messages for this branch
      const messages = await memoryManager.getMessages(sessionId, b.id);
      logger.info(`  Messages in branch: ${messages.length}`);
      
      for (const msg of messages) {
        logger.info(`  - [${msg.role}] ${msg.content.substring(0, 40)}...`);
      }
    }
    
    // Get messages from main branch
    const mainMessages = await memoryManager.getMessages(sessionId);
    logger.info(`Found ${mainMessages.length} messages in main branch`);
    
    // Cleanup
    await redisManager.disconnect();
    logger.info('\nAll tests completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testStreamingWithMemoryAndModels().catch(error => {
  logger.error('Unhandled exception:', error);
  process.exit(1);
}); 