/**
 * Test script to verify the BranchManager implementation
 * 
 * Run with: npx ts-node src/test-branching.ts
 * 
 * This script tests the branch management functionality including:
 * - Creating branches
 * - Retrieving branches
 * - Switching between branches
 * - Editing messages
 * - Merging branches
 * - Archive and delete operations
 */

import { BranchManager, Branch, BranchHistoryEntry } from './services/llm/memory/branch';
import { RedisManager } from './services/llm/memory/redis';
import { Message } from './services/llm/types';
import { v4 as uuidv4 } from 'uuid';

// Function to create a RedisManager instance for testing
async function createRedisManager(): Promise<RedisManager> {
  // Check if Redis URL is provided
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    const redisManager = new RedisManager({
      enabled: true,
      url: redisUrl,
      prefix: 'test-branching:',
      sessionTTL: 3600, // 1 hour
      maxRetries: 3,
      retryTimeout: 1000,
    });
    
    await redisManager.connect();
    console.log('Connected to Redis successfully!');
    return redisManager;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
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
async function testBranchManager() {
  console.log('=== BranchManager Test ===');
  
  try {
    // Create Redis manager for testing
    const redisManager = await createRedisManager();
    
    // Create branch manager
    const branchManager = new BranchManager(redisManager);
    
    // Create a test session
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
    };
    
    console.log(`Creating test session ${sessionId}...`);
    await redisManager.setSession(session);
    
    // Create some initial messages in the main conversation
    console.log('Creating initial messages...');
    const message1 = createTestMessage(sessionId, 'Hello, how are you today?');
    const message2 = createTestMessage(
      sessionId, 
      'I am an AI assistant, ready to help you with any questions.', 
      'assistant',
      undefined,
      message1.id
    );
    const message3 = createTestMessage(
      sessionId, 
      'Can you tell me about the solar system?', 
      'user',
      undefined,
      message2.id
    );
    
    // Store the messages
    await redisManager.storeMessage(message1);
    await redisManager.storeMessage(message2);
    await redisManager.storeMessage(message3);
    
    console.log(`Created ${3} initial messages`);
    
    // Test 1: Create a branch from message3
    console.log('\n--- Test 1: Create Branch ---');
    
    const branch1 = await branchManager.createBranch(
      sessionId,
      message3.id,
      { name: 'Solar System Branch' }
    );
    
    console.log('Created branch:', branch1);
    console.assert(branch1.id.length > 0, 'Branch should have a valid ID');
    console.assert(branch1.name === 'Solar System Branch', 'Branch name should match');
    console.assert(branch1.sessionId === sessionId, 'Branch session ID should match');
    console.assert(branch1.originMessageId === message3.id, 'Branch origin message should match');
    
    // Test 2: Create a second branch
    console.log('\n--- Test 2: Create Second Branch ---');
    
    const branch2 = await branchManager.createBranch(
      sessionId,
      message2.id,
      { name: 'Alternative Topic Branch' }
    );
    
    console.log('Created second branch:', branch2);
    
    // Test 3: Get all branches
    console.log('\n--- Test 3: Get All Branches ---');
    
    const branches = await branchManager.getBranches(sessionId);
    console.log(`Retrieved ${branches.length} branches:`, branches.map(b => b.name));
    console.assert(branches.length === 2, 'Should have 2 branches');
    
    // Test 4: Switch to a branch
    console.log('\n--- Test 4: Switch Branch ---');
    
    const activeBranch = await branchManager.switchBranch(sessionId, branch1.id);
    console.log('Switched to branch:', activeBranch.name);
    console.assert(activeBranch.isActive === true, 'Branch should be marked as active');
    
    // Test 5: Add messages to the active branch
    console.log('\n--- Test 5: Add Messages to Branch ---');
    
    const branchMessage1 = createTestMessage(
      sessionId, 
      'The solar system consists of the Sun and everything that orbits around it.', 
      'assistant',
      branch1.id,
      message3.id
    );
    
    const branchMessage2 = createTestMessage(
      sessionId, 
      'Can you tell me more about the planets?', 
      'user',
      branch1.id,
      branchMessage1.id
    );
    
    await redisManager.storeMessage(branchMessage1);
    await redisManager.storeMessage(branchMessage2);
    
    // Get branch messages
    const branchMessages = await branchManager.getBranchMessages(branch1.id);
    console.log(`Retrieved ${branchMessages.length} messages for branch:`, 
      branchMessages.map(m => m.content.substring(0, 30) + '...'));
    
    // Test 6: Edit a message in the branch
    console.log('\n--- Test 6: Edit Message ---');
    
    const editedMessage = await branchManager.editMessage(
      branchMessage1.id, 
      'The solar system consists of the Sun and eight planets, as well as dwarf planets, asteroids, and comets.'
    );
    
    console.log('Edited message:', editedMessage.content);
    console.assert(editedMessage.version === 2, 'Edited message should have version 2');
    console.assert(editedMessage.metadata?.edited === true, 'Message should be marked as edited');
    
    // Get message versions
    const versions = await branchManager.getMessageVersions(branchMessage1.id);
    console.log(`Retrieved ${versions.length} versions of the message`);
    console.assert(versions.length > 0, 'Should have message versions');
    
    // Test 7: Switch to the second branch
    console.log('\n--- Test 7: Switch to Second Branch ---');
    
    const secondActiveBranch = await branchManager.switchBranch(sessionId, branch2.id);
    console.log('Switched to branch:', secondActiveBranch.name);
    
    // Add a message to the second branch
    const branch2Message = createTestMessage(
      sessionId, 
      'Let\'s talk about quantum computing instead.', 
      'user',
      branch2.id,
      message2.id
    );
    
    await redisManager.storeMessage(branch2Message);
    
    // Test 8: Merge branches
    console.log('\n--- Test 8: Merge Branches ---');
    
    // First, let's switch back to branch1
    await branchManager.switchBranch(sessionId, branch1.id);
    
    // Now merge branch2 into branch1
    const mergedBranch = await branchManager.mergeBranches(
      sessionId,
      branch2.id,
      branch1.id
    );
    
    console.log('Merged branch:', mergedBranch.name);
    
    // Get messages after merge
    const messagesAfterMerge = await branchManager.getBranchMessages(branch1.id);
    console.log(`After merge, branch has ${messagesAfterMerge.length} messages`);
    
    // Test 9: Get branch history
    console.log('\n--- Test 9: Get Branch History ---');
    
    const history = await branchManager.getBranchHistory(sessionId);
    console.log(`Retrieved ${history.length} branch history events:`);
    history.slice(0, 3).forEach((entry, i) => {
      console.log(`  ${i+1}. ${entry.action} - Branch ${entry.branchId.substring(0, 8)}... at ${new Date(entry.timestamp).toISOString()}`);
    });
    
    // Test 10: Archive a branch
    console.log('\n--- Test 10: Archive Branch ---');
    
    const archivedBranch = await branchManager.archiveBranch(sessionId, branch2.id);
    console.log('Archived branch:', archivedBranch.name);
    console.assert(archivedBranch.isArchived === true, 'Branch should be marked as archived');
    
    // Get branches including archived
    const allBranches = await branchManager.getBranches(sessionId, true);
    console.log(`Retrieved ${allBranches.length} branches (including archived)`);
    
    // Get only active branches
    const activeBranches = await branchManager.getBranches(sessionId, false);
    console.log(`Retrieved ${activeBranches.length} active branches`);
    console.assert(activeBranches.length < allBranches.length, 'Should have fewer active branches than total');
    
    // Test 11: Delete a branch
    console.log('\n--- Test 11: Delete Branch ---');
    
    await branchManager.deleteBranch(sessionId, branch2.id, { deleteMessages: true });
    console.log('Deleted branch:', branch2.id);
    
    // Verify deletion
    const remainingBranches = await branchManager.getBranches(sessionId, true);
    console.log(`After deletion, ${remainingBranches.length} branches remain`);
    
    // Clean up
    console.log('\n--- Cleaning Up Test Data ---');
    
    // Delete remaining branch
    await branchManager.deleteBranch(sessionId, branch1.id, { deleteMessages: true });
    
    // Delete session
    await redisManager.getClient().del(`test-branching:session:${sessionId}`);
    
    console.log('Cleanup completed');
    console.log('\n=== All Branch Tests Completed Successfully! ===');
    
    // Disconnect from Redis
    await redisManager.disconnect();
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
testBranchManager().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 