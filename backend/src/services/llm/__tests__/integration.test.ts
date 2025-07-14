import assert from 'assert';
import { createLLMService } from '../index';
import { LLMServiceConfig, Message, MessageRole, ChatResponse } from '../types';
import { RedisManager } from '../memory/redis';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../utils/logger';

// Configure timeout
const TEST_TIMEOUT = 30000;

async function runTests() {
  let llmService;
  let redisManager;

  console.log('🚀 Starting LLM Service Integration Tests...\n');

  try {
    console.log('Setting up test environment...');
    
    // First create a temporary LLM service to get available models
    const tempService = createLLMService({
      model: {
        provider: 'ollama',
        modelId: 'llama3.2', // temporary model ID, will be updated
        baseUrl: 'http://localhost:11434'
      }
    });
    await tempService.initialize();
    
    // Get available models
    const models = await tempService.listModels();
    if (!models || models.length === 0) {
      throw new Error('No models available in Ollama. Please pull at least one model first.');
    }
    
    // Select the first available model
    const selectedModel = models[0];
    console.log(`Using model: ${selectedModel.name}\n`);
    
    // Initialize Redis manager
    redisManager = new RedisManager({
      enabled: true,
      url: 'redis://localhost:6379',
      prefix: 'test:',
      sessionTTL: 3600
    });
    await redisManager.initialize();

    // Initialize LLM service with the selected model
    llmService = createLLMService({
      model: {
        provider: 'ollama',
        modelId: selectedModel.name,
        baseUrl: 'http://localhost:11434'
      },
      memory: {
        redis: {
          enabled: true,
          url: 'redis://localhost:6379',
          prefix: 'test:',
          sessionTTL: 3600
        },
        defaults: {
          maxContextSize: 4096,
          sessionTTL: 3600,
          maxMessageSize: 4096
        },
        database: {
          type: 'postgres',
          url: 'postgresql://localhost:5432/test',
          key: 'test-key',
          enabled: false
        }
      }
    });
    await llmService.initialize();
    console.log('✅ Test environment setup complete\n');

    // Test 1: Basic Chat Flow
    console.log('Running Test: Basic Chat Flow');
    
    // Create a session ID
    const sessionId = uuidv4();
    
    // Create root message
    const rootMessage: Message = {
      id: uuidv4(),
      sessionId,
      role: 'system' as MessageRole,
      content: 'You are a helpful assistant.',
      timestamp: Date.now(),
      version: 1,
      metadata: {}
    };
    
    // Store root message in Redis
    await redisManager.storeMessage(rootMessage);
    
    // Create session with the root message
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 1,
      branches: ['main'],
      model: selectedModel.name
    };
    await redisManager.setSession(session);
    
    // Now create the main branch with the root message
    await llmService.createBranch(sessionId, rootMessage.id, {
      name: 'main',
      metadata: { isMainBranch: true }
    });

    // Send user message
    const userMessage = "What is the capital of France?";
    const response = await llmService.chat({
      sessionId,
      message: userMessage,
      parentMessageId: rootMessage.id
    });

    assert(response, 'Response should be defined');
    assert(response.text, 'Response should have text');
    assert.strictEqual(response.sessionId, sessionId, 'Session ID should match');
    assert(response.messageId, 'Message ID should be defined');

    // Verify messages in Redis
    const messages = await redisManager.getMessages(sessionId);
    assert(messages.length >= 3, 'Should have at least 3 messages (system + user + assistant)');
    
    const userStoredMessage = messages.find(m => m.role === 'user');
    assert(userStoredMessage, 'User message should exist');
    assert.strictEqual(userStoredMessage.content, userMessage, 'User message content should match');

    const assistantMessage = messages.find(m => m.role === 'assistant' && m.content === response.text);
    assert(assistantMessage, 'Assistant message should exist');
    assert.strictEqual(assistantMessage.content, response.text, 'Assistant message content should match');
    console.log('✅ Basic Chat Flow test passed\n');

    // Test 2: Model Management
    console.log('Running Test: Model Management');
    const mathResponse = await llmService.chat({
      sessionId,
      message: "What is 2+2?",
      parentMessageId: response.messageId
    });

    assert(mathResponse, 'Math response should be defined');
    assert(mathResponse.metadata?.model === selectedModel.name, 'Model should match selected model');

    const mathMessages = await redisManager.getMessages(sessionId);
    const lastMessage = mathMessages[mathMessages.length - 1];
    assert(lastMessage.metadata?.model === selectedModel.name, 'Last message should have correct model metadata');
    console.log('✅ Model Management test passed\n');

    // Test 3: Error Handling
    console.log('Running Test: Error Handling');
    // Test Redis disconnection recovery
    await redisManager.disconnect();
    
    // Try to send a message without Redis (should fall back to in-memory)
    const disconnectedResponse = await llmService.chat({
      sessionId,
      message: "Test message during Redis disconnection",
      parentMessageId: rootMessage.id
    });

    assert(disconnectedResponse, 'Should get response even with Redis disconnected');
    assert(disconnectedResponse.text, 'Response should have text');

    // Reconnect Redis
    await redisManager.initialize();
    console.log('✅ Error Handling test passed\n');

    // Test 4: Streaming Response
    console.log('Running Test: Streaming Response');
    let streamedContent = '';
    const streamingResponse = await llmService.chat({
      sessionId,
      message: "Tell me a short story",
      parentMessageId: rootMessage.id,
      callbacks: {
        onToken: (token) => {
          streamedContent += token;
        },
        onComplete: () => {
          console.log('Stream completed');
        },
        onError: (error) => {
          console.error('Stream error:', error);
        }
      }
    });

    assert(streamingResponse, 'Streaming response should be defined');
    assert(streamedContent.length > 0, 'Should have received streamed content');
    assert.strictEqual(streamingResponse.text, streamedContent, 'Final text should match streamed content');
    console.log('✅ Streaming Response test passed\n');

    // Test 5: Context Management
    console.log('Running Test: Context Management');
    // Send a sequence of related messages to test context retention
    const contextResponses: ChatResponse[] = [];
    const contextMessages = [
      "My name is John.",
      "What's my name?",
      "What did I tell you earlier about myself?"
    ];

    for (const msg of contextMessages) {
      const resp = await llmService.chat({
        sessionId,
        message: msg,
        parentMessageId: contextResponses.length > 0 
          ? contextResponses[contextResponses.length - 1].messageId 
          : rootMessage.id
      });
      contextResponses.push(resp);
    }

    // Verify context is maintained
    const lastResponse = contextResponses[contextResponses.length - 1];
    assert(lastResponse.text.toLowerCase().includes('john'), 'Context should be maintained across messages');
    console.log('✅ Context Management test passed\n');

    // Test 6: Branch Operations
    console.log('Running Test: Branch Operations');
    
    // Create a new branch from an existing message
    const newBranch = await llmService.createBranch(sessionId, contextResponses[0].messageId, {
      name: 'Alternative Path',
      metadata: { purpose: 'testing' }
    });
    
    // Switch to the new branch
    await llmService.switchBranch(sessionId, newBranch.id);
    
    // Send a message in the new branch
    const branchResponse = await llmService.chat({
      sessionId,
      message: "Let's talk about something else. What's the weather like?",
      parentMessageId: contextResponses[0].messageId
    });

    // Verify branch message
    const branchMessages = await redisManager.getMessages(sessionId);
    const branchMessage = branchMessages.find(m => m.id === branchResponse.messageId);
    assert(branchMessage, 'Branch message should exist');
    assert.strictEqual(branchMessage.branchId, newBranch.id, 'Message should be in the new branch');

    // Get branch history
    const branchHistory = await llmService.getBranchHistory(sessionId);
    assert(branchHistory.length > 0, 'Should have branch history');
    assert(branchHistory.some(h => h.action === 'create' && h.branchId === newBranch.id), 
      'Branch creation should be in history');
    
    console.log('✅ Branch Operations test passed\n');

    // Test 7: Concurrent Sessions
    console.log('Running Test: Concurrent Sessions');
    
    // Create multiple sessions and send messages concurrently
    const sessionCount = 3;
    const sessions = await Promise.all(
      Array(sessionCount).fill(0).map(async () => {
        const sid = uuidv4();
        const sysMsg: Message = {
          id: uuidv4(),
          sessionId: sid,
          role: 'system' as MessageRole,
          content: 'You are a helpful assistant.',
          timestamp: Date.now(),
          version: 1,
          metadata: {}
        };
        
        await redisManager.storeMessage(sysMsg);
        await redisManager.setSession({
          id: sid,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          messageCount: 1,
          branches: ['main'],
          model: selectedModel.name
        });
        
        await llmService.createBranch(sid, sysMsg.id, {
          name: 'main',
          metadata: { isMainBranch: true }
        });
        
        return { sessionId: sid, systemMessage: sysMsg };
      })
    );

    // Send messages to all sessions concurrently
    const concurrentResponses = await Promise.all(
      sessions.map(s => llmService.chat({
        sessionId: s.sessionId,
        message: "Hello, how are you?",
        parentMessageId: s.systemMessage.id
      }))
    );

    assert.strictEqual(concurrentResponses.length, sessionCount, 'Should get responses for all sessions');
    assert(concurrentResponses.every(r => r.text), 'All responses should have text');
    console.log('✅ Concurrent Sessions test passed\n');

    console.log('🎉 All tests passed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nCleaning up test environment...');
    if (redisManager) {
      await redisManager.clear();
      await redisManager.disconnect();
    }
    if (llmService) {
      await llmService.shutdown();
    }
    console.log('✅ Cleanup complete');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 