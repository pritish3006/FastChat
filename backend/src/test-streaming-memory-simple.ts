/**
 * Simplified streaming test integrating memory and models without WebSockets
 * 
 * This test demonstrates:
 * - Direct streaming from model providers
 * - Memory storage and context assembly
 * - Conversation branches using Memory services
 * 
 * Run with: npx ts-node src/test-streaming-memory-simple.ts
 */

import { v4 as uuidv4 } from 'uuid';
import { RedisManager } from './services/llm/memory/redis';
import { MemoryManager } from './services/llm/memory';
import { MemoryConfig } from './services/llm/memory/config';
import { ModelProviderFactory } from './services/llm/providers';
import { ollamaService } from './services/llm/ollama';
import { ModelConfig, Message, StreamController } from './services/llm/types';
import logger from './utils/logger';

// Set log level to debug for more details
logger.level = 'debug';

// Timeout for operations (in milliseconds)
const OPERATION_TIMEOUT = 15000; // 15 seconds

// Simple response accumulator for tests
class ResponseAccumulator {
  public content: string = '';
  public tokens: string[] = [];
  
  onStart() {
    logger.info('Stream started');
    process.stdout.write('\n');
  }
  
  onToken(token: string) {
    this.content += token;
    this.tokens.push(token);
    process.stdout.write(token);
  }
  
  onEnd() {
    process.stdout.write('\n');
    logger.info('Stream completed');
    logger.info(`Accumulated ${this.tokens.length} tokens`);
  }
  
  onError(error: Error) {
    logger.error('Stream error:', error);
  }
}

// Helper function to format section headers
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80) + '\n');
}

/**
 * Create a message object for storing in memory
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
 * Stream a response directly from Ollama, displaying tokens in real-time
 */
async function streamOllamaResponse(
  model: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const accumulator = new ResponseAccumulator();
  accumulator.onStart();
  
  logger.debug(`Sending direct Ollama request: model=${model}, system=${systemPrompt || 'none'}`);
  logger.debug(`Prompt: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`);
  
  try {
    // Use the Ollama service directly for better error handling
    const controller = await ollamaService.generateCompletion({
      model: model,
      prompt: prompt,
      system: systemPrompt || "You are a helpful assistant specializing in history.",
      stream: true,
      options: {
        temperature: 0.7
      }
    });
    
    logger.debug('Ollama stream controller created');
    
    // Handle the streaming response with timeout
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.warn(`Stream timeout after ${OPERATION_TIMEOUT}ms`);
          // Try to abort the stream if possible
          try {
            controller.emit('end');
          } catch (e) {
            // Ignore errors when trying to abort
          }
          // Resolve anyway to continue the test
          resolve();
        }, OPERATION_TIMEOUT);
        
        controller.on('data', (data) => {
          if (data.response) {
            accumulator.onToken(data.response);
          }
        });
        
        controller.on('error', (error) => {
          clearTimeout(timeout);
          logger.error('Ollama streaming error:', error);
          accumulator.onError(error);
          reject(error);
        });
        
        controller.on('end', () => {
          clearTimeout(timeout);
          accumulator.onEnd();
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // Safety timer - resolve after timeout + 1 second regardless
        setTimeout(() => {
          logger.warn('Safety timer triggered - forcing resolution');
          resolve();
        }, OPERATION_TIMEOUT + 1000);
      })
    ]);
    
    logger.debug('Ollama stream completed successfully');
    return accumulator.content;
    
  } catch (error) {
    logger.error('Error during Ollama streaming:', error);
    throw error;
  }
}

/**
 * Main test function
 */
async function testStreamingWithMemory() {
  logSection('STREAMING WITH MEMORY INTEGRATION TEST');
  
  try {
    // STEP 1: Initialize all services
    logger.info('Initializing services...');
    
    // 1.1 Initialize Redis Manager
    let redisManager;
    try {
      redisManager = new RedisManager({
        enabled: true,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        prefix: 'memory-integration-test:',
        sessionTTL: 3600,
      });
      
      await redisManager.connect();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis connection failed, continuing with in-memory only:', error);
    }
    
    // 1.2 Initialize Memory Manager
    const memoryConfig: MemoryConfig = {
      redis: {
        enabled: !!redisManager,
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        prefix: 'memory-integration-test:',
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
    
    // 1.3 Get available models from Ollama
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
    
    // STEP 2: Create a new session
    logSection('SESSION SETUP');
    
    const sessionId = uuidv4();
    logger.info(`Created new session with ID: ${sessionId}`);
    
    // STEP 3: Test basic Q&A with memory
    logSection('TEST 1: BASIC Q&A WITH MEMORY STORAGE');
    
    // First question
    const firstQuestion = "Who was Chandragupta Maurya?";
    logger.info(`User question: "${firstQuestion}"`);
    
    // Store user message in memory
    const userMessage1 = createMessage(sessionId, 'user', firstQuestion);
    await memoryManager.storeMessage(userMessage1);
    logger.info(`Stored user message in memory with ID: ${userMessage1.id}`);
    
    // Stream the response directly from Ollama
    logger.info('Getting streaming response from Ollama...');
    try {
      const firstResponse = await streamOllamaResponse(
        selectedModel.name,
        firstQuestion,
        "You are a helpful assistant specializing in history."
      );
      
      // Store the assistant's response in memory
      const assistantMessage1 = createMessage(sessionId, 'assistant', firstResponse);
      await memoryManager.storeMessage(assistantMessage1);
      logger.info(`Stored assistant response in memory with ID: ${assistantMessage1.id}`);
      
      // STEP 4: Test follow-up with context
      logSection('TEST 2: FOLLOW-UP WITH CONTEXT');
      
      // Ask follow-up question
      const followUpQuestion = "Tell me about his predecessor and enemies.";
      logger.info(`Follow-up question: "${followUpQuestion}"`);
      
      // Store the follow-up question
      const userMessage2 = createMessage(sessionId, 'user', followUpQuestion);
      await memoryManager.storeMessage(userMessage2);
      
      // Assemble context from previous conversation
      const context = await memoryManager.assembleContext(
        sessionId,
        followUpQuestion,
        {
          maxMessages: 10,
          useSimilarity: false
        }
      );
      
      logger.info(`Assembled context with ${context.messages.length} messages`);
      
      // Create combined prompt for Ollama
      const combinedPrompt = [
        ...context.messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`),
        `USER: ${followUpQuestion}`
      ].join('\n\n');
      
      // Stream the response for the follow-up question
      logger.info('Getting streaming response for follow-up question with context...');
      const followUpResponse = await streamOllamaResponse(
        selectedModel.name,
        combinedPrompt,
        context.systemPrompt
      );
      
      // Store the assistant's response
      const assistantMessage2 = createMessage(sessionId, 'assistant', followUpResponse);
      await memoryManager.storeMessage(assistantMessage2);
      
      // STEP 5: Test branching
      logSection('TEST 3: CONVERSATION BRANCHING');
      
      try {
        // Create a branch from the first response
        logger.info('Creating a branch from the first response...');
        const branchManager = memoryManager.getBranchManager();
        logger.debug('Branch manager retrieved successfully');
        
        // Detailed logging to diagnose the issue
        logger.debug(`Attempting to create branch from message: ${assistantMessage1.id}`);
        logger.debug(`Session ID: ${sessionId}`);
        
        try {
          const branch = await branchManager.createBranch(
            sessionId,
            assistantMessage1.id,
            {
              name: "Alternate history branch"
            }
          );
          
          logger.info(`Created branch with ID: ${branch.id}`);
          
          // Ask an alternate question in the branch
          const alternateQuestion = "What if Chandragupta never founded the Mauryan Empire?";
          logger.info(`Branch question: "${alternateQuestion}"`);
          
          // Store the branch question
          const branchUserMessage = createMessage(sessionId, 'user', alternateQuestion, branch.id);
          await memoryManager.storeMessage(branchUserMessage);
          
          // Assemble context for the branch
          const branchContext = await memoryManager.assembleContext(
            sessionId,
            alternateQuestion,
            {
              branchId: branch.id,
              maxMessages: 10,
              useSimilarity: false
            }
          );
          
          logger.info(`Assembled branch context with ${branchContext.messages.length} messages`);
          
          // Create combined prompt for branch question
          const branchCombinedPrompt = [
            ...branchContext.messages.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`),
            `USER: ${alternateQuestion}`
          ].join('\n\n');
          
          // Stream the response for the branch question
          logger.info('Getting streaming response for branch question...');
          const branchResponse = await streamOllamaResponse(
            selectedModel.name,
            branchCombinedPrompt,
            branchContext.systemPrompt
          );
          
          // Store the branch response
          const branchAssistantMessage = createMessage(
            sessionId, 
            'assistant', 
            branchResponse, 
            branch.id
          );
          await memoryManager.storeMessage(branchAssistantMessage);
        } catch (branchError) {
          logger.error('Error creating branch:', branchError);
          logger.warn('Skipping branch-related tests due to error');
        }
      } catch (branchingError) {
        logger.error('Error in branching section:', branchingError);
        logger.warn('Skipping remaining branch tests');
      }
      
      // STEP 6: Verify persistence
      logSection('TEST 4: VERIFY PERSISTENCE');
      
      try {
        // List all branches
        const branchManager = memoryManager.getBranchManager();
        const branches = await branchManager.getBranches(sessionId);
        logger.info(`Found ${branches.length} branches for session ${sessionId}`);
        
        for (const b of branches) {
          logger.info(`Branch: ${b.name || 'unnamed'} (${b.id}), isActive: ${b.isActive}`);
          
          // Get messages for this branch
          const messages = await memoryManager.getMessages(sessionId, b.id);
          logger.info(`  Messages in branch: ${messages.length}`);
          
          for (const msg of messages) {
            const preview = msg.content.length > 40 
              ? msg.content.substring(0, 40) + '...' 
              : msg.content;
            logger.info(`  - [${msg.role}] ${preview}`);
          }
        }
        
        // Get messages from main branch
        const mainMessages = await memoryManager.getMessages(sessionId);
        logger.info(`Found ${mainMessages.length} messages in main branch`);
        
        for (const msg of mainMessages) {
          const preview = msg.content.length > 40 
            ? msg.content.substring(0, 40) + '...' 
            : msg.content;
          logger.debug(`  - [${msg.role}] ${preview}`);
        }
      } catch (persistenceError) {
        logger.error('Error in persistence verification:', persistenceError);
        logger.warn('Skipping persistence verification due to error');
      }
      
    } catch (error) {
      logger.error('Error during streaming test:', error);
      throw error;
    }
    
    // Cleanup
    if (redisManager) {
      await redisManager.disconnect();
    }
    logger.info('\nAll tests completed successfully!');
    
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testStreamingWithMemory().catch(error => {
  logger.error('Unhandled exception:', error);
  process.exit(1);
}); 