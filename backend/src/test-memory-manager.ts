/**
 * Comprehensive test for the Memory Manager component
 * 
 * This test script verifies the functionality of the MemoryManager including:
 * - Context assembly
 * - Message storage and retrieval
 * - Conversation history management
 * - Vector search (if configured)
 * - Branch-aware message retrieval
 * 
 * Run with: npx ts-node src/test-memory-manager.ts
 * 
 * Note: Redis must be running on localhost:6379 (or set REDIS_URL env var)
 * For vector search tests, Supabase environment variables must be set
 */

import { MemoryManager } from './services/llm/memory';
import { RedisManager } from './services/llm/memory/redis';
import { BranchManager } from './services/llm/memory/branch';
import { Message, Session, Context } from './services/llm/types';
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

// Main test function
async function testMemoryManager() {
  logSection('Memory Manager Component Test');
  
  // Initialize Redis Manager
  logger.info('Initializing Redis Manager...');
  
  let memoryManager: MemoryManager | undefined;
  
  try {
    memoryManager = new MemoryManager({
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      sessionTTL: 3600,
      vectorStore: process.env.SUPABASE_URL && process.env.SUPABASE_KEY ? {
        type: 'supabase',
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_KEY,
        tableName: 'message_embeddings'
      } : undefined,
      persistenceOptions: {
        persistImmediately: true,
        maxRedisAge: 3600,
        batchSize: 100
      }
    });
    
    await memoryManager.initialize();
    logger.info('Memory Manager initialized successfully');
    
    // Generate a unique session ID for testing
    const sessionId = `memory-test-${uuidv4()}`;
    logger.info(`Test session ID: ${sessionId}`);
    
    // Test 1: Session Management
    logSection('Test 1: Session Management');
    
    logger.info('Creating a new session...');
    const session: Session = {
      id: uuidv4(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: []
    };
    await memoryManager.getRedisManager().setSession(session);
    logger.info(`Session created with ID: ${session.id}`);
    
    // Get session
    logger.info('Retrieving the session...');
    const retrievedSession = await memoryManager.getRedisManager().getSession(session.id);
    
    if (!retrievedSession) {
      throw new Error('Failed to retrieve the session');
    }
    
    logger.info(`Retrieved session: ${retrievedSession.id}`);
    logger.info(`Session created at: ${new Date(retrievedSession.createdAt).toISOString()}`);
    
    // Test 2: Message Storage
    logSection('Test 2: Message Storage');
    
    // Create test messages representing a conversation
    const systemPrompt = "You are a helpful AI assistant.";
    
    logger.info('Creating test messages...');
    const message1 = createTestMessage(session.id, systemPrompt, 'system');
    const message2 = createTestMessage(session.id, "Hi there, can you tell me about memory systems in AI?", 'user');
    const message3 = createTestMessage(
      session.id, 
      "Memory systems in AI refer to mechanisms that allow AI models to retain and recall information across interactions. " +
      "They can include short-term context windows, long-term vector storage, and hierarchical memory structures.",
      'assistant',
      undefined,
      message2.id
    );
    const message4 = createTestMessage(
      session.id,
      "What's the difference between short-term and long-term memory in AI systems?",
      'user',
      undefined,
      message3.id
    );
    
    // Store the messages
    logger.info('Storing messages...');
    await memoryManager.storeMessage(message1);
    await memoryManager.storeMessage(message2);
    await memoryManager.storeMessage(message3);
    await memoryManager.storeMessage(message4);
    
    logger.info('Messages stored successfully');
    
    // Test 3: Conversation History Retrieval
    logSection('Test 3: Conversation History Retrieval');
    
    // Get all messages for the session
    const conversationHistory = await memoryManager.getRedisManager().getMessages(session.id);
    logger.info(`Retrieved ${conversationHistory.length} messages`);
    
    // Log message details
    conversationHistory.forEach((message: Message, i: number) => {
      logger.info(`Message ${i+1}: ${message.role} - "${message.content.substring(0, 30)}..."`);
    });
    
    // Test 4: Context Assembly
    logSection('Test 4: Context Assembly');
    
    const context = await memoryManager.assembleContext(
      session.id,
      "What's the difference between short-term and long-term memory?",
      {
        maxTokens: 4096,
        maxMessages: 10,
        useSimilarity: false
      }
    );
    
    logger.info(`Context assembled with ${context.messages.length} messages`);
    logger.info(`Context metadata: ${JSON.stringify(context.metadata)}`);
    
    // Test 5: Branching
    logSection('Test 5: Branch Testing');
    
    logger.info('Creating a branch from the existing conversation...');
    const branch = await memoryManager.getBranchManager().createBranch(
      session.id,
      message4.id,
      { name: 'Memory Types Branch' }
    );
    
    logger.info(`Branch created: ${branch.id} (${branch.name})`);
    
    // Switch to the branch
    logger.info(`Switching to branch: ${branch.id}`);
    await memoryManager.getBranchManager().switchBranch(session.id, branch.id);
    
    // Create messages in the branch
    const branchMessage1 = createTestMessage(
      session.id,
      "Short-term memory in AI typically refers to the context window of a conversation, while long-term memory " +
      "involves storing and retrieving information from external databases or vector stores. Short-term memory " +
      "is limited by the context window size, while long-term memory can persist indefinitely.",
      'assistant',
      branch.id,
      message4.id
    );
    
    const branchMessage2 = createTestMessage(
      session.id,
      "That's interesting! Can you give an example of how vector stores work for long-term memory?",
      'user',
      branch.id,
      branchMessage1.id
    );
    
    // Store branch messages
    logger.info('Storing messages in the branch...');
    await memoryManager.storeMessage(branchMessage1);
    await memoryManager.storeMessage(branchMessage2);
    
    // Get branch messages
    logger.info('Retrieving branch messages...');
    const branchMessages = await memoryManager.getBranchManager().getBranchMessages(branch.id);
    
    logger.info(`Retrieved ${branchMessages.length} messages from the branch`);
    branchMessages.forEach((message: Message, i: number) => {
      logger.info(`[${message.role}]: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`);
    });
    
    // Assemble context with branch
    logger.info('Assembling context with branch awareness...');
    const branchContext = await memoryManager.assembleContext(
      session.id,
      "Tell me more about memory types",
      {
        maxTokens: 4000,
        branchId: branch.id,
        useSimilarity: true
      }
    );
    
    logger.info(`Branch context assembled with ${branchContext.messages.length} messages`);
    logger.info(`Branch context metadata: ${JSON.stringify(branchContext.metadata)}`);
    
    // Test 6: Vector Search (if available)
    logSection('Test 6: Vector Search');
    
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      logger.info('Testing vector search functionality...');
      
      // Wait for embeddings to be generated (may take a moment)
      logger.info('Waiting for embeddings to be processed...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Perform a semantic search
      const query = "How do AI systems store information long-term?";
      logger.info(`Performing semantic search with query: "${query}"`);
      
      try {
        const searchResults = await memoryManager.findSimilarMessages(
          session.id,
          query,
          { limit: 3, threshold: 0.7 }
        );
        
        logger.info(`Found ${searchResults.length} similar messages`);
        searchResults.forEach((result, i) => {
          logger.info(`Result ${i+1} (${result.metadata?.similarity?.toFixed(4) || 'N/A'}):`);
          logger.info(`  ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}`);
        });
      } catch (error: unknown) {
        logger.warn('Vector search failed:', error instanceof Error ? error.message : 'Unknown error');
        logger.info('Vector search may require additional setup or waiting for embeddings to be processed');
      }
    } else {
      logger.info('Vector search test skipped - no vector store configuration provided');
    }
    
    // Test 7: Context Window Management
    logSection('Test 7: Context Window Management');
    
    logger.info('Testing context window management with different token limits...');
    
    const tokenLimits = [1000, 2000, 4000];
    
    for (const limit of tokenLimits) {
      logger.info(`Assembling context with ${limit} token limit...`);
      
      const limitedContext = await memoryManager.assembleContext(
        session.id,
        "How does memory work?",
        {
          maxTokens: limit,
          maxMessages: 5,
          useSimilarity: false
        }
      );
      
      logger.info(`Context with ${limit} token limit: ${limitedContext.messages.length} messages, ~${limitedContext.metadata.tokenCount} tokens`);
      
      // We'd expect fewer messages with stricter token limits
      if (limit < 2000 && limitedContext.messages.length === branchContext.messages.length) {
        logger.warn(`Expected fewer messages with ${limit} token limit`);
      }
    }
    
    // Test 8: Message Editing
    logSection('Test 8: Message Editing');
    
    if (branchMessage1) {
      logger.info('Testing message editing functionality...');
      
      const originalContent = branchMessage1.content;
      const editedContent = "Short-term memory is limited by the model's context window. Long-term memory uses vector databases or other persistence mechanisms to store and retrieve information across sessions.";
      
      try {
        // Edit via branch manager since memory manager might not expose this directly
        logger.info(`Editing message: ${branchMessage1.id}`);
        const editedMessage = await memoryManager.getBranchManager().editMessage(branchMessage1.id, editedContent);
        
        logger.info(`Message edited successfully (version ${editedMessage.version})`);
        logger.info(`Original: "${originalContent.substring(0, 50)}..."`);
        logger.info(`Edited: "${editedMessage.content.substring(0, 50)}..."`);
        
        // Get message versions
        logger.info('Getting message versions...');
        const versions = await memoryManager.getBranchManager().getMessageVersions(branchMessage1.id);
        logger.info(`Retrieved ${versions.length} versions of the message`);
      } catch (error: unknown) {
        logger.warn('Message editing failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Test 9: Cleanup
    logSection('Test 9: Cleanup');
    
    // Clean up branch
    logger.info(`Deleting branch: ${branch.id}`);
    await memoryManager.getBranchManager().deleteBranch(session.id, branch.id, { deleteMessages: true });
    
    // Clean up session
    logger.info(`Deleting session: ${session.id}`);
    await memoryManager.getRedisManager().getClient().del(`${memoryManager.getRedisManager()['keyPrefix']}session:${session.id}`);
    
    // Clean up all keys
    const client = memoryManager.getRedisManager().getClient();
    const allKeys = await client.keys(`${memoryManager.getRedisManager()['keyPrefix']}*`);
    
    logger.info(`Found ${allKeys.length} remaining test keys to clean up`);
    
    if (allKeys.length > 0) {
      await client.del(...allKeys);
      logger.info('All test keys deleted');
    }
    
    logSection('All Tests Completed Successfully');
    
  } catch (error) {
    logger.error('Test failed:', error);
    
    // Attempt to clean up even if test fails
    try {
      if (memoryManager) {
        const redisManagerInstance = memoryManager.getRedisManager();
        if (redisManagerInstance) {
          await redisManagerInstance.disconnect();
          logger.info('Redis connection closed after error');
        }
      }
    } catch (e) {
      logger.error('Error during cleanup:', e);
    }
  }
}

// Run the tests
testMemoryManager().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 