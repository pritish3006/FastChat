/**
 * langchain integration test
 * 
 * tests the langchain integration with the fast-chat application.
 * verifies memory, streaming, and token tracking functionality.
 */

import { LangChainService } from './services/llm/langchain';
import logger from './utils/logger';
import { ModelProviderFactory } from './services/llm/providers';
import { RedisManager } from './services/llm/memory/redis';
import { createServer } from 'http';
import express from 'express';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

async function testLangChainIntegration() {
  logger.info('Starting LangChain integration test');
  
  try {
    // Initialize Redis (optional, comment out if not needed)
    const redisManager = new RedisManager({
      enabled: true,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      prefix: 'langchain-test:',
      sessionTTL: 3600,
    });
    
    await redisManager.connect();
    logger.info('Redis connected');
    
    // Initialize model provider
    const modelProvider = await ModelProviderFactory.getProvider({
      provider: 'ollama',
      name: 'llama2',
      baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434'
    });
    
    logger.info('Model provider initialized');
    
    // Create a test session
    const sessionId = uuidv4();
    const userId = 'test-user';
    
    // Create LangChain service
    const langchainService = new LangChainService({
      model: {
        provider: modelProvider,
        name: 'llama2',
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
    
    // Create a test server for streaming responses
    const app = express();
    const server = createServer(app);
    
    app.get('/test-stream', async (req, res) => {
      const conversationChain = langchainService.getConversationChain({
        systemPrompt: 'You are a helpful assistant that provides short, concise answers.'
      });
      
      langchainService.streamChainToResponse(
        conversationChain,
        { question: 'What is the capital of France?' },
        res,
        { metadata: { sessionId, userId } }
      );
      
      logger.info('Streaming started');
    });
    
    // Test chain with memory
    const testNonStreamingChain = async () => {
      const chain = langchainService.getConversationChain({
        systemPrompt: 'You are a helpful assistant that provides short, concise answers.'
      });
      
      const input = { question: 'What is the capital of France?' };
      
      logger.info('Invoking chain', { input });
      const result = await chain.invoke(input);
      
      logger.info('Chain result', { result });
      
      // Save to memory
      await langchainService.saveToMemory(input, result);
      
      // Test memory with follow-up
      const followUpInput = { question: 'What is its population?' };
      
      logger.info('Invoking follow-up', { input: followUpInput });
      const followUpResult = await chain.invoke(followUpInput);
      
      logger.info('Follow-up result', { result: followUpResult });
    };
    
    // Test branching chain
    const testBranchingChain = async () => {
      const chain = langchainService.getBranchingChain();
      
      const input = {
        sourceBranchId: 'branch-1',
        targetBranchId: 'branch-2',
        task: 'compare',
        sourceContent: 'This is the content of branch 1.',
        targetContent: 'This is the content of branch 2 with some differences.'
      };
      
      logger.info('Invoking branching chain', { input });
      const result = await chain.invoke(input);
      
      logger.info('Branching chain result', { result });
    };
    
    // Test context-aware chain
    const testContextAwareChain = async () => {
      const chain = langchainService.getContextAwareChain({
        contextProvider: async () => {
          return 'Paris is the capital of France and has a population of about 2.16 million people.';
        }
      });
      
      const input = { question: 'Tell me about the population of the capital of France.' };
      
      logger.info('Invoking context-aware chain', { input });
      const result = await chain.invoke(input);
      
      logger.info('Context-aware chain result', { result });
    };
    
    // Start server on a random port
    const port = 3456;
    server.listen(port, () => {
      logger.info(`Test server listening on port ${port}`);
      logger.info(`Test streaming at http://localhost:${port}/test-stream`);
    });
    
    // Run tests
    await testNonStreamingChain();
    await testBranchingChain();
    await testContextAwareChain();
    
    // Give some time for the streaming test to be accessed manually
    logger.info('Tests completed. Streaming test server will remain active for 60 seconds.');
    logger.info(`Visit http://localhost:${port}/test-stream to test streaming.`);
    
    setTimeout(async () => {
      // Clean up
      server.close();
      
      if (redisManager) {
        await redisManager.disconnect();
      }
      
      logger.info('Test completed and resources cleaned up.');
      process.exit(0);
    }, 60000);
    
  } catch (error) {
    logger.error('Test failed', { error });
    process.exit(1);
  }
}

// Run the test
testLangChainIntegration().catch(error => {
  logger.error('Uncaught error in test', { error });
  process.exit(1);
}); 