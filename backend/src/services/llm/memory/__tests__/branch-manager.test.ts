import { BranchManager } from '../branch';
import { RedisManager } from '../redis';
import { Message } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../../utils/logger';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Use real Redis instance
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function testBranchManager() {
  logSection('Testing Branch Manager');

  try {
    // Initialize Redis Manager
    const redisManager = new RedisManager({
      enabled: true,
      url: REDIS_URL,
      prefix: 'test:memory:',
      sessionTTL: 300 // 5 minutes for testing
    });

    await redisManager.initialize();
    logger.info('✓ Redis connection established');

    // Initialize Branch Manager
    const branchManager = new BranchManager(redisManager);
    logger.info('✓ Branch Manager initialized');

    // Test 1: Create Branch
    logger.info('\nTest: Create Branch');
    const sessionId = uuidv4();
    const originMessage: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: 'Original message',
      timestamp: Date.now(),
      version: 1
    };

    await redisManager.addMessage(originMessage);
    const branch = await branchManager.createBranch(sessionId, originMessage.id, {
      name: 'Test Branch',
      metadata: { test: true }
    });

    if (!branch || !branch.id) {
      throw new Error('Branch creation failed');
    }
    logger.info('✓ Branch created successfully');

    // Test 2: Get Branch
    logger.info('\nTest: Get Branch');
    const retrievedBranch = await branchManager.getBranch(branch.id);
    if (!retrievedBranch || retrievedBranch.id !== branch.id) {
      throw new Error('Branch retrieval failed');
    }
    logger.info('✓ Branch retrieved successfully');

    // Test 3: Edit Message
    logger.info('\nTest: Edit Message');
    const editedMessage = await branchManager.editMessage(originMessage.id, 'Edited message');
    if (!editedMessage || editedMessage.content !== 'Edited message') {
      throw new Error('Message edit failed');
    }
    logger.info('✓ Message edited successfully');

    // Test 4: Get Message Versions
    logger.info('\nTest: Get Message Versions');
    const versions = await branchManager.getMessageVersions(originMessage.id);
    if (versions.length < 2) {
      throw new Error('Message version history incomplete');
    }
    logger.info('✓ Message versions retrieved successfully');

    // Test 5: Switch Branch
    logger.info('\nTest: Switch Branch');
    const switchedBranch = await branchManager.switchBranch(sessionId, branch.id);
    if (!switchedBranch.isActive) {
      throw new Error('Branch switch failed');
    }
    logger.info('✓ Branch switched successfully');

    // Test 6: Create Child Branch
    logger.info('\nTest: Create Child Branch');
    const childMessage: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',
      content: 'Child branch message',
      timestamp: Date.now(),
      branchId: branch.id,
      version: 1
    };

    await redisManager.addMessage(childMessage);
    const childBranch = await branchManager.createBranch(sessionId, childMessage.id, {
      name: 'Child Branch',
      metadata: { test: true, parent: branch.id }
    });

    if (!childBranch || childBranch.parentBranchId !== branch.id) {
      throw new Error('Child branch creation failed');
    }
    logger.info('✓ Child branch created successfully');

    // Test 7: Merge Branches
    logger.info('\nTest: Merge Branches');
    const mergedBranch = await branchManager.mergeBranches(sessionId, childBranch.id, branch.id);
    if (!mergedBranch) {
      throw new Error('Branch merge failed');
    }
    logger.info('✓ Branches merged successfully');

    // Test 8: Get Branch History
    logger.info('\nTest: Get Branch History');
    const history = await branchManager.getBranchHistory(sessionId);
    if (!history || history.length === 0) {
      throw new Error('Branch history retrieval failed');
    }
    logger.info('✓ Branch history retrieved successfully');

    // Cleanup
    logger.info('\nTest: Cleanup');
    await branchManager.archiveBranch(sessionId, branch.id);
    const archivedBranch = await branchManager.getBranch(branch.id);
    if (!archivedBranch?.isArchived) {
      throw new Error('Branch archive failed');
    }
    logger.info('✓ Branch archived successfully');

    return true;
  } catch (error) {
    logger.error('Branch Manager tests failed:', error);
    return false;
  }
}

// Run the tests
testBranchManager().then(success => {
  if (!success) {
    process.exit(1);
  }
}); 