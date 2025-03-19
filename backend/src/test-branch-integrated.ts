/**
 * Branch Manager Integration Test with Real LLM Integration
 * 
 * This test demonstrates how branching functionality works with real models
 * and conversation context preservation.
 * 
 * Run with: npm run test:branch:integrated
 */

import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import chalk from 'chalk';
import { LLMService } from './services/llm';
import { config } from './config';

// Set log level to info
logger.level = 'info';

/**
 * Helper function to log section headers
 */
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(chalk.bold.blue(title));
  logger.info('='.repeat(80));
}

/**
 * Main test function
 */
async function testBranchIntegrated() {
  logSection('Branch Manager Integration Test with LLM');
  
  let llmService;
  
  try {
    // Initialize LLM Service with Redis memory
    llmService = new LLMService({
      model: {
        provider: 'ollama',
        modelId: process.env.TEST_MODEL || 'llama2',
        baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
        temperature: 0.7
      },
      memory: {
        redis: {
          enabled: true,
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          prefix: 'branch-test-integrated:',
          sessionTTL: 3600
        },
        database: {
          type: 'supabase',
          url: process.env.SUPABASE_URL || '',
          key: process.env.SUPABASE_KEY || '',
          enabled: false
        },
        defaults: {
          maxContextSize: 4000,
          sessionTTL: 3600,
          maxMessageSize: 100000
        }
      }
    });
    
    await llmService.initialize();
    logger.info(`${chalk.green('✓')} LLM Service initialized`);
    
    // Create a new session
    const session = await llmService.startSession();
    const sessionId = session.id;
    logger.info(`${chalk.green('✓')} Created new session: ${sessionId}`);
    
    // Run the tests
    await testBasicConversation(llmService, sessionId);
    await testBranchCreationAndSwitching(llmService, sessionId);
    await testBranchMerging(llmService, sessionId);
    
    logger.info(`${chalk.green('✓')} All tests completed successfully!`);
    
  } catch (error: any) {
    logger.error(`${chalk.red('✗')} Test failed:`, error.message);
    if (error.stack) {
      logger.debug(error.stack);
    }
    process.exit(1);
  } finally {
    if (llmService) {
      await llmService.shutdown();
      logger.info(`${chalk.blue('i')} LLM Service shut down`);
    }
  }
}

/**
 * Test 1: Basic conversation
 */
async function testBasicConversation(llmService: LLMService, sessionId: string) {
  logSection('Test 1: Basic Conversation');
  
  try {
    // Start a conversation
    logger.info(`${chalk.blue('i')} Starting conversation in main branch`);
    
    // First user message
    const response1 = await llmService.chat({
      sessionId,
      message: "Tell me about the Maurya Empire in ancient India.",
    });
    
    logger.info(`${chalk.green('✓')} Received response of ${response1.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Response preview: ${response1.text.substring(0, 150)}...`);
    
    // Second user message
    const response2 = await llmService.chat({
      sessionId,
      message: "Who was Emperor Ashoka and what was he known for?",
    });
    
    logger.info(`${chalk.green('✓')} Received response of ${response2.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Response preview: ${response2.text.substring(0, 150)}...`);
    
    // Return message ID to branch from
    return response2.messageId;
  } catch (error: any) {
    logger.error(`${chalk.red('✗')} Test 1 failed:`, error.message);
    throw error;
  }
}

/**
 * Test 2: Branch creation and switching
 */
async function testBranchCreationAndSwitching(llmService: LLMService, sessionId: string) {
  logSection('Test 2: Branch Creation and Switching');
  
  try {
    // First establish a base conversation
    const branchFromMessageId = await testBasicConversation(llmService, sessionId);
    
    // Create a branch
    logger.info(`${chalk.blue('i')} Creating branch from message: ${branchFromMessageId}`);
    
    const branch = await llmService.createBranch(
      sessionId,
      branchFromMessageId,
      {
        name: "Cultural Focus",
        metadata: {
          description: "Exploring cultural aspects of the Maurya Empire"
        }
      }
    );
    
    logger.info(`${chalk.green('✓')} Created branch: ${branch.id} (${branch.name})`);
    
    // Switch to the branch
    logger.info(`${chalk.blue('i')} Switching to branch: ${branch.id}`);
    await llmService.switchBranch(sessionId, branch.id);
    logger.info(`${chalk.green('✓')} Switched to branch: ${branch.name}`);
    
    // Continue conversation in branch
    const branchResponse1 = await llmService.chat({
      sessionId,
      message: "Tell me about the cultural and artistic achievements during this period.",
      branchId: branch.id
    });
    
    logger.info(`${chalk.green('✓')} Received branch response of ${branchResponse1.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Branch response preview: ${branchResponse1.text.substring(0, 150)}...`);
    
    // Second branch message
    const branchResponse2 = await llmService.chat({
      sessionId,
      message: "What architectural marvels were created during the Maurya Empire?",
      branchId: branch.id
    });
    
    logger.info(`${chalk.green('✓')} Received second branch response of ${branchResponse2.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Branch response preview: ${branchResponse2.text.substring(0, 150)}...`);
    
    // Switch back to main branch
    logger.info(`${chalk.blue('i')} Switching back to main branch`);
    await llmService.switchBranch(sessionId, 'main');
    logger.info(`${chalk.green('✓')} Switched back to main branch`);
    
    // Continue conversation in main branch with a different topic
    const mainResponse = await llmService.chat({
      sessionId,
      message: "Tell me about the military strength of the Maurya Empire.",
      branchId: 'main'
    });
    
    logger.info(`${chalk.green('✓')} Received main branch response of ${mainResponse.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Main branch response preview: ${mainResponse.text.substring(0, 150)}...`);
    
    return { branch, branchResponse1, mainResponse };
  } catch (error: any) {
    logger.error(`${chalk.red('✗')} Test 2 failed:`, error.message);
    throw error;
  }
}

/**
 * Test 3: Branch merging
 */
async function testBranchMerging(llmService: LLMService, sessionId: string) {
  logSection('Test 3: Branch Merging');
  
  try {
    // Get all branches
    const branches = await llmService.getBranches(sessionId);
    logger.info(`${chalk.blue('i')} Found ${branches.length} branches`);
    
    // Find the branch to merge
    const branch = branches.find(b => b.id !== 'main');
    if (!branch) {
      logger.warn(`${chalk.yellow('⚠')} No non-main branch found, skipping merge test`);
      return;
    }
    
    // Get message counts before merge
    const redisManager = llmService['memoryManager'].getRedisManager();
    const mainMessagesBefore = await redisManager.getMessages(sessionId, 'main');
    const branchMessagesBefore = await redisManager.getMessages(sessionId, branch.id);
    
    logger.info(`${chalk.blue('i')} Before merging: Main branch has ${mainMessagesBefore.length} messages`);
    logger.info(`${chalk.blue('i')} Before merging: Branch has ${branchMessagesBefore.length} messages`);
    
    // Display message contents before merging
    logger.info(`${chalk.magenta('📝')} Main branch messages before merge:`);
    mainMessagesBefore.slice(-5).forEach((msg, i) => {
      const preview = msg.content.length > 50 ? `${msg.content.substring(0, 50)}...` : msg.content;
      logger.info(`${chalk.gray(`   ${mainMessagesBefore.length-4+i}.`)} ${msg.role}: ${preview}`);
    });
    
    logger.info(`${chalk.magenta('📝')} Branch "${branch.name}" messages before merge:`);
    branchMessagesBefore.forEach((msg, i) => {
      const preview = msg.content.length > 50 ? `${msg.content.substring(0, 50)}...` : msg.content;
      logger.info(`${chalk.gray(`   ${i+1}.`)} ${msg.role}: ${preview}`);
    });
    
    // Merge branch to main
    logger.info(`${chalk.blue('i')} Merging branch "${branch.name}" to main branch`);
    await llmService.mergeBranches(sessionId, branch.id, 'main');
    logger.info(`${chalk.green('✓')} Successfully merged branch to main`);
    
    // Get message counts after merge
    const mainMessagesAfter = await redisManager.getMessages(sessionId, 'main');
    logger.info(`${chalk.blue('i')} After merging: Main branch has ${mainMessagesAfter.length} messages`);
    
    // Display message contents after merging
    logger.info(`${chalk.magenta('📝')} Main branch messages after merge:`);
    mainMessagesAfter.slice(-10).forEach((msg, i) => {
      const preview = msg.content.length > 50 ? `${msg.content.substring(0, 50)}...` : msg.content;
      const source = msg.branchId !== 'main' ? ` [from branch: ${msg.branchId}]` : '';
      logger.info(`${chalk.gray(`   ${mainMessagesAfter.length-9+i}.`)} ${msg.role}: ${preview}${source}`);
    });
    
    // Test that merged content is now accessible in the main branch
    logger.info(`${chalk.blue('i')} Testing knowledge access post-merge with a summary question`);
    const summaryResponse = await llmService.chat({
      sessionId,
      message: "Summarize both the military strength and cultural achievements of the Maurya Empire.",
    });
    
    logger.info(`${chalk.green('✓')} Received summary response of ${summaryResponse.text.length} characters`);
    logger.info(`${chalk.magenta('📝')} Summary response:\n${summaryResponse.text}`);
    
  } catch (error: any) {
    logger.error(`${chalk.red('✗')} Test 3 failed:`, error.message);
    throw error;
  }
}

// Run the integrated test
testBranchIntegrated().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});