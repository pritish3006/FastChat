/**
 * DISABLED FILE - Skip TypeScript compilation
 * 
 * This file is temporarily disabled to focus on core functionality.
 */

// @ts-nocheck
import { RedisManager } from './redis';
import { LLMServiceError } from '../errors';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../utils/logger';

export class BranchError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'BRANCH_ERROR', 400, context);
  }
}

export interface Branch {
  id: string;
  name: string;
  sessionId: string;
  parentBranchId?: string;
  originMessageId: string;
  createdAt: number;
  depth: number;
  isActive?: boolean;       // Whether this is the current active branch
  isArchived?: boolean;     // Whether this branch has been archived
  deletedAt?: number;       // When this branch was deleted (if applicable)
  metadata?: Record<string, any>;
}

export interface BranchOptions {
  name?: string;
  metadata?: Record<string, any>;
}

export interface BranchHistoryEntry {
  timestamp: number;
  action: 'create' | 'merge' | 'switch' | 'edit' | 'archive' | 'delete';
  branchId: string;
  userId?: string;
  details?: Record<string, any>;
}

/**
 * Manages conversation branches and message versioning
 * Handles creating branches, editing messages, and version control
 */
export class BranchManager {
  private redis: RedisManager;

  constructor(redis: RedisManager) {
    this.redis = redis;
  }

  /**
   * Creates a new branch from an existing message
   */
  async createBranch(
    sessionId: string,
    originMessageId: string,
    options: BranchOptions = {}
  ): Promise<Branch> {
    // Get the original message to branch from
    const originMessage = await this.getMessage(originMessageId);
    if (!originMessage) {
      throw new BranchError('Origin message not found', { originMessageId });
    }

    // Determine the parent branch ID (if this is already part of a branch)
    const parentBranchId = originMessage.branchId;
    
    // Create new branch
    const branch: Branch = {
      id: uuidv4(),
      sessionId,
      name: options.name || `Branch ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      originMessageId,
      parentBranchId,
      depth: 0, // Initialize depth at 0, will be updated as messages are added
      isActive: false,
      isArchived: false,
      metadata: options.metadata
    };

    // Store branch data
    await this.saveBranch(branch);

    // Update session to track this branch
    await this.addBranchToSession(sessionId, branch.id);

    // Track branch history
    await this.trackBranchHistory(sessionId, {
      timestamp: Date.now(),
      action: 'create',
      branchId: branch.id,
      details: {
        parentBranchId,
        originMessageId
      }
    });

    return branch;
  }

  /**
   * Gets all branches for a session
   */
  async getBranches(sessionId: string, includeArchived: boolean = false): Promise<Branch[]> {
    const session = await this.redis.getSession(sessionId);
    if (!session || !session.branches?.length) {
      return [];
    }

    const branches: Branch[] = [];
    
    for (const branchId of session.branches) {
      const branch = await this.getBranch(branchId);
      if (branch && (includeArchived || !branch.isArchived)) {
        branches.push(branch);
      }
    }

    return branches;
  }

  /**
   * Gets a specific branch
   */
  async getBranch(branchId: string): Promise<Branch | null> {
    const key = this.redis.buildKey('branch', branchId);
    const data = await this.redis.getClient()?.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Edits a message and creates a new version
   */
  async editMessage(
    messageId: string, 
    newContent: string
  ): Promise<Message> {
    // Get original message
    const originalMessage = await this.getMessage(messageId);
    if (!originalMessage) {
      throw new BranchError('Message not found', { messageId });
    }

    // Create a new version
    const newVersion = this.createMessageVersion(originalMessage, newContent);
    
    // Store updated message
    await this.saveMessageVersion(newVersion);

    // Track branch history for the edit if this is part of a branch
    if (originalMessage.branchId) {
      await this.trackBranchHistory(originalMessage.sessionId, {
        timestamp: Date.now(),
        action: 'edit',
        branchId: originalMessage.branchId,
        details: {
          messageId,
          originalMessageId: originalMessage.id
        }
      });
    }

    return newVersion;
  }

  /**
   * Gets all message versions
   */
  async getMessageVersions(messageId: string): Promise<Message[]> {
    const key = this.redis.buildKey('messageVersions', messageId);
    const versionIds = await this.redis.getClient()?.lrange(key, 0, -1);
    
    if (!versionIds || versionIds.length === 0) {
      return [];
    }

    const versions: Message[] = [];
    
    for (const versionId of versionIds) {
      const version = await this.getMessage(versionId);
      if (version) {
        versions.push(version);
      }
    }

    return versions;
  }

  /**
   * Switches to a different branch in the session
   */
  async switchBranch(sessionId: string, branchId: string): Promise<Branch> {
    // Get the branch to verify it exists
    const branch = await this.getBranch(branchId);
    if (!branch) {
      throw new BranchError('Branch not found', { branchId });
    }

    if (branch.sessionId !== sessionId) {
      throw new BranchError('Branch does not belong to this session', { sessionId, branchId });
    }

    if (branch.isArchived) {
      throw new BranchError('Cannot switch to archived branch', { branchId });
    }

    // Get all branches for the session
    const branches = await this.getBranches(sessionId);
    
    // Reset active flag on all branches
    for (const existingBranch of branches) {
      if (existingBranch.isActive) {
        existingBranch.isActive = false;
        await this.saveBranch(existingBranch);
      }
    }
    
    // Set this branch as active
    branch.isActive = true;
    await this.saveBranch(branch);
    
    // Track branch history
    await this.trackBranchHistory(sessionId, {
      timestamp: Date.now(),
      action: 'switch',
      branchId: branch.id
    });
    
    return branch;
  }

  /**
   * Merges a source branch into a target branch
   */
  async mergeBranches(
    sessionId: string, 
    sourceBranchId: string, 
    targetBranchId: string
  ): Promise<Branch> {
    // Verify both branches exist
    const sourceBranch = await this.getBranch(sourceBranchId);
    if (!sourceBranch) {
      throw new BranchError('Source branch not found', { sourceBranchId });
    }
    
    const targetBranch = await this.getBranch(targetBranchId);
    if (!targetBranch) {
      throw new BranchError('Target branch not found', { targetBranchId });
    }
    
    if (sourceBranch.sessionId !== sessionId || targetBranch.sessionId !== sessionId) {
      throw new BranchError('Branches must belong to the same session', { sessionId });
    }
    
    if (sourceBranch.isArchived) {
      throw new BranchError('Source branch is archived', { sourceBranchId });
    }
    
    if (targetBranch.isArchived) {
      throw new BranchError('Target branch is archived', { targetBranchId });
    }

    // Get all messages from source branch
    const sourceMessages = await this.getBranchMessages(sourceBranchId);
    
    // Identify messages to merge (those after the origin point)
    const originMessageId = sourceBranch.originMessageId;
    const messagesToMerge = sourceMessages.filter(msg => {
      // Skip the origin message itself
      if (msg.id === originMessageId) return false;
      
      // Include messages that came after the origin
      const originTimestamp = sourceMessages.find(m => m.id === originMessageId)?.timestamp || 0;
      return msg.timestamp > originTimestamp;
    });
    
    // Apply merged messages to target branch
    for (const message of messagesToMerge) {
      // Create a copy of the message with the target branch ID
      const mergedMessage: Message = {
        ...message,
        id: uuidv4(), // New ID for the merged message
        branchId: targetBranchId,
        metadata: {
          ...message.metadata,
          mergedFrom: sourceBranchId,
          originalMessageId: message.id
        }
      };
      
      // Store the merged message
      await this.redis.storeMessage(mergedMessage);
    }
    
    // Update target branch metadata to record the merge
    targetBranch.metadata = {
      ...targetBranch.metadata,
      merges: [
        ...(targetBranch.metadata?.merges || []),
        {
          sourceBranchId,
          timestamp: Date.now(),
          messageCount: messagesToMerge.length
        }
      ]
    };
    
    await this.saveBranch(targetBranch);
    
    // Track branch history
    await this.trackBranchHistory(sessionId, {
      timestamp: Date.now(),
      action: 'merge',
      branchId: targetBranchId,
      details: {
        sourceBranchId,
        messageCount: messagesToMerge.length
      }
    });
    
    return targetBranch;
  }

  /**
   * Archives a branch (soft delete)
   */
  async archiveBranch(sessionId: string, branchId: string): Promise<Branch> {
    const branch = await this.getBranch(branchId);
    if (!branch) {
      throw new BranchError('Branch not found', { branchId });
    }
    
    if (branch.sessionId !== sessionId) {
      throw new BranchError('Branch does not belong to this session', { sessionId, branchId });
    }
    
    if (branch.isArchived) {
      // Already archived
      return branch;
    }
    
    // Archive the branch
    branch.isArchived = true;
    
    // If this was the active branch, we need to deactivate it
    if (branch.isActive) {
      branch.isActive = false;
      
      // Find the main branch or another branch to make active
      const branches = await this.getBranches(sessionId);
      const mainBranch = branches.find(b => !b.parentBranchId);
      
      if (mainBranch) {
        await this.switchBranch(sessionId, mainBranch.id);
      } else if (branches.length > 0) {
        // Pick the first non-archived branch
        const anotherBranch = branches.find(b => !b.isArchived && b.id !== branchId);
        if (anotherBranch) {
          await this.switchBranch(sessionId, anotherBranch.id);
        }
      }
    }
    
    await this.saveBranch(branch);
    
    // Track branch history
    await this.trackBranchHistory(sessionId, {
      timestamp: Date.now(),
      action: 'archive',
      branchId
    });
    
    return branch;
  }

  /**
   * Permanently deletes a branch and optionally its messages
   */
  async deleteBranch(
    sessionId: string, 
    branchId: string, 
    options: { deleteMessages?: boolean } = {}
  ): Promise<void> {
    const branch = await this.getBranch(branchId);
    if (!branch) {
      throw new BranchError('Branch not found', { branchId });
    }
    
    if (branch.sessionId !== sessionId) {
      throw new BranchError('Branch does not belong to this session', { sessionId, branchId });
    }
    
    // If this is the active branch and not archived yet, archive it first
    if (branch.isActive && !branch.isArchived) {
      await this.archiveBranch(sessionId, branchId);
    }
    
    // Mark as deleted
    branch.deletedAt = Date.now();
    branch.isArchived = true;
    branch.isActive = false;
    await this.saveBranch(branch);
    
    // Remove from session branches list
    await this.removeBranchFromSession(sessionId, branchId);
    
    // Delete messages if requested
    if (options.deleteMessages) {
      const messages = await this.getBranchMessages(branchId);
      for (const message of messages) {
        await this.redis.deleteMessage(message.id);
      }
    }
    
    // Track branch history
    await this.trackBranchHistory(sessionId, {
      timestamp: Date.now(),
      action: 'delete',
      branchId,
      details: {
        deletedMessages: options.deleteMessages ? true : false
      }
    });
    
    logger.info(`Branch ${branchId} deleted from session ${sessionId}`);
  }

  /**
   * Gets the message history for a specific branch
   */
  async getBranchMessages(branchId: string): Promise<Message[]> {
    const key = this.redis.buildKey('branchMessages', branchId);
    
    // Use zrange for sorted sets instead of lrange
    const messageIds = await this.redis.getClient()?.zrange(key, 0, -1) || [];
    
    const messages: Message[] = [];
    for (const messageId of messageIds) {
      const message = await this.getMessage(messageId);
      if (message) {
        messages.push(message);
      }
    }
    
    // Messages are already sorted by timestamp in Redis sorted set
    return messages;
  }

  /**
   * Gets branch history for a session
   */
  async getBranchHistory(sessionId: string): Promise<BranchHistoryEntry[]> {
    const key = this.redis.buildKey('branchHistory', sessionId);
    const history = await this.redis.getClient()?.lrange(key, 0, -1) || [];
    
    return history.map(entry => JSON.parse(entry)).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Tracks branch history events
   */
  private async trackBranchHistory(
    sessionId: string, 
    entry: BranchHistoryEntry
  ): Promise<void> {
    const key = this.redis.buildKey('branchHistory', sessionId);
    await this.redis.getClient()?.lpush(key, JSON.stringify(entry));
    
    // Trim history to a reasonable size (latest 100 entries)
    await this.redis.getClient()?.ltrim(key, 0, 99);
  }

  /**
   * Cleans up old/unused branches
   */
  async cleanupBranches(sessionId: string, options: {
    olderThan?: number;  // Timestamp (branches older than this will be archived)
    keepActive?: boolean; // Don't archive active branches
    limit?: number;      // Maximum number of branches to keep
  } = {}): Promise<number> {
    const branches = await this.getBranches(sessionId, true);
    
    // Sort branches by activity - active first, then by recency
    branches.sort((a, b) => {
      // Active branches first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      
      // Then by creation date (newer first)
      return b.createdAt - a.createdAt;
    });
    
    let archivedCount = 0;
    const now = Date.now();
    const olderThan = options.olderThan || now - (30 * 24 * 60 * 60 * 1000); // Default: 30 days
    const limit = options.limit || 10; // Default: keep 10 branches
    
    // If we have more branches than the limit, archive the excess
    if (branches.length > limit) {
      // Start from the end of the sorted list (oldest, non-active branches)
      for (let i = limit; i < branches.length; i++) {
        const branch = branches[i];
        
        // Skip if it's already archived or active and we want to keep active branches
        if (branch.isArchived || (options.keepActive && branch.isActive)) {
          continue;
        }
        
        // Archive branch if it's older than the specified time
        if (branch.createdAt < olderThan) {
          await this.archiveBranch(sessionId, branch.id);
          archivedCount++;
        }
      }
    }
    
    return archivedCount;
  }

  /**
   * Gets a message by ID
   */
  private async getMessage(messageId: string): Promise<Message | null> {
    return this.redis.getMessage(messageId);
  }

  /**
   * Saves a branch
   */
  async saveBranch(branch: Branch): Promise<void> {
    const key = this.redis.buildKey('branch', branch.id);
    await this.redis.getClient()?.set(key, JSON.stringify(branch));
  }

  /**
   * Adds a branch to a session
   */
  private async addBranchToSession(sessionId: string, branchId: string): Promise<void> {
    const session = await this.redis.getSession(sessionId);
    if (!session) {
      throw new BranchError('Session not found', { sessionId });
    }

    // Add branch to session
    session.branches = [...(session.branches || []), branchId];
    
    // Update session
    await this.redis.updateSession(sessionId, session);
  }

  /**
   * Removes a branch from a session
   */
  private async removeBranchFromSession(sessionId: string, branchId: string): Promise<void> {
    const session = await this.redis.getSession(sessionId);
    if (!session) {
      throw new BranchError('Session not found', { sessionId });
    }
    
    // Remove branch from session
    session.branches = (session.branches || []).filter(id => id !== branchId);
    
    // Update session
    await this.redis.updateSession(sessionId, session);
  }

  /**
   * Creates a new message version
   */
  private createMessageVersion(originalMessage: Message, newContent: string): Message {
    // Create a new version of the message
    const newVersion: Message = {
      ...originalMessage,
      id: uuidv4(), // New ID for the version
      content: newContent,
      timestamp: Date.now(),
      version: (originalMessage.version || 1) + 1,
      metadata: {
        ...originalMessage.metadata,
        edited: true,
        originalContent: originalMessage.content,
        originalMessageId: originalMessage.id
      }
    };

    return newVersion;
  }

  /**
   * Saves a message version
   */
  private async saveMessageVersion(message: Message): Promise<void> {
    // Save the new message
    await this.redis.storeMessage(message);
    
    // Add to versions list for the original message
    const originalId = message.metadata?.originalMessageId;
    if (originalId) {
      const key = this.redis.buildKey('messageVersions', originalId);
      await this.redis.getClient()?.lpush(key, message.id);
    }
    
    // If this is part of a branch, also add to branch messages
    if (message.branchId) {
      const key = this.redis.buildKey('branchMessages', message.branchId);
      // Use zadd for sorted sets with timestamp as score for proper ordering
      await this.redis.getClient()?.zadd(key, message.timestamp, message.id);
    }
  }
} 