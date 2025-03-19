/**
 * Comprehensive end-to-end test for the LLM service
 * 
 * This test script verifies that all components of the LLM service 
 * work together correctly, including:
 * - Model provider (Ollama)
 * - Memory management (Redis)
 * - Context assembly
 * - Streaming
 * - Branching
 * - Token tracking
 * 
 * Run with: npx ts-node src/test-llm-integrated.ts
 * 
 * Note: Redis and Ollama must be running for this test to succeed
 */

import { LLMService } from './services/llm';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import logger from './utils/logger';

// Set log level to info
logger.level = 'info';

// Mock WebSocket class for testing
class MockWebSocket extends EventEmitter {
  private messages: any[] = [];
  private contentBuffer: string = '';

  send(data: string): void {
    const parsed = JSON.parse(data);
    this.messages.push(parsed);
    
    // Accumulate content for token messages
    if (parsed.type === 'token' && parsed.content) {
      this.contentBuffer += parsed.content;
      process.stdout.write('.');
    } else if (parsed.type === 'stream_start') {
      logger.info('Stream started');
    } else if (parsed.type === 'stream_end') {
      logger.info('\nStream ended');
    }
  }

  getMessages(): any[] {
    return this.messages;
  }

  getAccumulatedContent(): string {
    return this.contentBuffer;
  }

  simulateClose(): void {
    this.emit('close');
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

// Enable debug output (prints text in progress)
const DEBUG = true;

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Main test function
async function testLLMIntegrated() {
  logSection('LLM Service Integrated Test');
  
  // Redis URL - defaults to localhost if not specified
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  // Initialize LLM service with all features
  const llmService = new LLMService({
    model: {
      provider: 'ollama',
      modelId: 'llama3.2',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      temperature: 0.7,
    },
    memory: {
      redis: {
        enabled: true,
        url: redisUrl,
        prefix: 'test-integrated:',
        sessionTTL: 3600, // 1 hour
      },
      database: {
        enabled: false,
        type: 'supabase',
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_KEY || '',
      },
      vector: {
        enabled: true,
        type: 'supabase',
        supabaseUrl: process.env.SUPABASE_URL || '',
        supabaseKey: process.env.SUPABASE_KEY || '',
        tableName: 'message_embeddings',
      },
      defaults: {
        maxContextSize: 50,
        sessionTTL: 3600,
        maxMessageSize: 32 * 1024, // 32KB
      }
    }
  });

  try {
    // Test 1: Initialize service
    logSection('Test 1: Service Initialization');
    
    logger.info('Initializing LLM service...');
    await llmService.initialize();
    logger.info('LLM service initialized successfully');
    
    // Generate a unique session ID for testing
    const testSessionId = `test-${uuidv4()}`;
    logger.info(`Test session ID: ${testSessionId}`);
    
    // Test 2: Basic chat without streaming
    logSection('Test 2: Basic Chat');
    
    logger.info('Testing basic chat functionality...');
    const basicResponse = await llmService.chat({
      sessionId: testSessionId,
      message: 'Hello, please introduce yourself briefly. Keep it very short.',
      systemPrompt: 'You are a helpful AI assistant. Always provide short, clear, and concise answers.'
    });
    
    logger.info(`Chat response received (${basicResponse.messageId})`);
    logger.info(`Content: "${basicResponse.text.substring(0, 100)}${basicResponse.text.length > 100 ? '...' : ''}"`);
    logger.info(`Tokens: prompt=${basicResponse.metadata?.tokens?.prompt}, completion=${basicResponse.metadata?.tokens?.completion}`);
    
    // Test 3: Create a branch
    logSection('Test 3: Branch Creation');
    
    logger.info('Creating a branch from the first message...');
    const branch = await llmService.createBranch(
      testSessionId,
      basicResponse.messageId,
      { name: 'Test Branch' }
    );
    
    logger.info(`Branch created: ${branch.id} (${branch.name})`);
    
    // Test 4: Get branches
    logSection('Test 4: Branch Listing');
    
    logger.info('Retrieving branches...');
    const branches = await llmService.getBranches(testSessionId);
    logger.info(`Retrieved ${branches.length} branches`);
    
    for (const b of branches) {
      logger.info(`- ${b.name} (${b.id})${b.isActive ? ' (active)' : ''}`);
    }
    
    // Test 5: Chat in branch
    logSection('Test 5: Branched Chat');
    
    logger.info('Testing chat in branch...');
    const branchResponse = await llmService.chat({
      sessionId: testSessionId,
      message: 'What are the main benefits of using TypeScript over JavaScript? Keep it very brief please.',
      branchId: branch.id,
      parentMessageId: basicResponse.messageId
    });
    
    logger.info(`Branch chat response received (${branchResponse.messageId})`);
    logger.info(`Content: "${branchResponse.text.substring(0, 100)}${branchResponse.text.length > 100 ? '...' : ''}"`);
    logger.info(`Tokens: prompt=${branchResponse.metadata?.tokens?.prompt}, completion=${branchResponse.metadata?.tokens?.completion}`);
    
    // Test 6: Streaming chat
    logSection('Test 6: Streaming Chat');
    
    logger.info('Testing streaming chat functionality...');
    const ws = new MockWebSocket();
    
    const streamingResponse = await llmService.chat({
      sessionId: testSessionId,
      message: 'Explain the concept of async/await in JavaScript very briefly.',
      websocket: ws as any
    });
    
    logger.info(`Streaming started (${streamingResponse.messageId})`);
    
    // Wait for streaming to complete
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Get messages from WebSocket
    const messages = ws.getMessages();
    logger.info(`Received ${messages.length} WebSocket messages`);
    
    // Count message types
    const messageCounts = messages.reduce((acc, msg) => {
      const type = msg.type;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    logger.info('Message types received:');
    Object.entries(messageCounts).forEach(([type, count]) => {
      logger.info(`- ${type}: ${count}`);
    });
    
    // Get the content from the stream_end message
    const endMessage = messages.find(m => m.type === 'stream_end');
    if (endMessage && endMessage.content) {
      logger.info('Final content received:');
      logger.info(`"${endMessage.content.substring(0, 100)}${endMessage.content.length > 100 ? '...' : ''}"`);
    } else {
      logger.warn('No stream_end message with content found');
    }
    
    // Test 7: Branch merging
    logSection('Test 7: Branch Merging');
    
    if (branches.length > 1) {
      logger.info('Testing branch merging...');
      
      // Find main branch
      const mainBranch = branches.find(b => !b.parentBranchId);
      
      if (mainBranch && branch) {
        logger.info(`Merging branch ${branch.name} into ${mainBranch.name || 'main'}`);
        
        const mergedBranch = await llmService.mergeBranches(
          testSessionId,
          branch.id, 
          mainBranch.id
        );
        
        logger.info(`Branch merged successfully: ${mergedBranch.id}`);
      } else {
        logger.warn('Could not find main branch for merging test');
      }
    } else {
      logger.warn('Skipping branch merging test (not enough branches)');
    }
    
    // Test 8: Token usage statistics
    logSection('Test 8: Token Usage Statistics');
    
    logger.info('Fetching token usage statistics...');
    const tokenUsage = await llmService.getSessionTokenUsage(testSessionId);
    
    logger.info('Token usage for test session:');
    logger.info(`- Prompt tokens: ${tokenUsage.prompt}`);
    logger.info(`- Completion tokens: ${tokenUsage.completion}`);
    logger.info(`- Total tokens: ${tokenUsage.total}`);
    
    // Test 9: Branch history
    logSection('Test 9: Branch History');
    
    logger.info('Fetching branch history...');
    const branchHistory = await llmService.getBranchHistory(testSessionId);
    
    logger.info(`Retrieved ${branchHistory.length} branch history entries:`);
    branchHistory.forEach((entry, i) => {
      logger.info(`${i+1}. [${new Date(entry.timestamp).toISOString()}] ${entry.action} - ${entry.branchId}`);
    });
    
    // Test 10: Cleanup
    logSection('Test 10: Cleanup');
    
    // Archive the branch
    logger.info(`Archiving branch: ${branch.id}`);
    const archivedBranch = await llmService.archiveBranch(testSessionId, branch.id);
    logger.info(`Branch archived: ${archivedBranch.id} (${archivedBranch.isArchived ? 'archived' : 'not archived'})`);
    
    // Delete the branch
    logger.info(`Deleting branch: ${branch.id}`);
    await llmService.deleteBranch(testSessionId, branch.id, { deleteMessages: true });
    logger.info('Branch deleted');
    
    // Shutdown service
    logger.info('Shutting down LLM service...');
    await llmService.shutdown();
    logger.info('LLM service shut down');
    
    logSection('All Tests Completed Successfully');
    
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Run the tests
testLLMIntegrated().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 