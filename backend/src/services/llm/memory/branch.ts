import { RedisManager } from './redis';
import { LLMServiceError } from '../errors';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

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
  metadata?: Record<string, any>;
}

export interface BranchOptions {
  name?: string;
  metadata?: Record<string, any>;
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
   * Creates a new branch from a specific message
   */
  async createBranch(
    sessionId: string,
    originMessageId: string,
    options: BranchOptions = {}
  ): Promise<Branch> {
    // Get origin message to verify it exists
    const originMessage = await this.getMessage(originMessageId);
    if (!originMessage) {
      throw new BranchError('Origin message not found', { originMessageId });
    }

    // Get parent branch if it exists
    const parentBranchId = originMessage.branchId;

    // Generate branch name if not provided
    const name = options.name || `Branch at ${new Date().toLocaleString()}`;
    
    // Create branch
    const branch: Branch = {
      id: uuidv4(),
      name,
      sessionId,
      parentBranchId,
      originMessageId,
      createdAt: Date.now(),
      depth: 0, // Will be updated when messages are added
      metadata: options.metadata
    };

    // Store branch data
    await this.saveBranch(branch);

    // Update session to track this branch
    await this.addBranchToSession(sessionId, branch.id);

    return branch;
  }

  /**
   * Gets all branches for a session
   */
  async getBranches(sessionId: string): Promise<Branch[]> {
    const session = await this.redis.getSession(sessionId);
    if (!session || !session.branches?.length) {
      return [];
    }

    const branches: Branch[] = [];
    
    for (const branchId of session.branches) {
      const branch = await this.getBranch(branchId);
      if (branch) {
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
   * Private helper methods
   */
  private async getMessage(messageId: string): Promise<Message | null> {
    const key = this.redis.buildKey('messageData', messageId);
    const data = await this.redis.getClient()?.get(key);
    return data ? JSON.parse(data) : null;
  }

  private async saveBranch(branch: Branch): Promise<void> {
    const key = this.redis.buildKey('branch', branch.id);
    await this.redis.getClient()?.setex(
      key,
      60 * 60 * 24 * 7, // 1 week TTL
      JSON.stringify(branch)
    );
  }

  private async addBranchToSession(sessionId: string, branchId: string): Promise<void> {
    const session = await this.redis.getSession(sessionId);
    if (!session) {
      throw new BranchError('Session not found', { sessionId });
    }

    if (!session.branches) {
      session.branches = [];
    }

    session.branches.push(branchId);
    await this.redis.setSession(session);
  }

  private createMessageVersion(originalMessage: Message, newContent: string): Message {
    const version = originalMessage.version + 1;
    
    // Create new message object
    const newVersion: Message = {
      ...originalMessage,
      id: uuidv4(), // New ID for the version
      content: newContent,
      version,
      timestamp: Date.now(),
      metadata: {
        ...originalMessage.metadata,
        edited: true,
        originalMessageId: originalMessage.id,
        originalContent: originalMessage.content,
      }
    };

    return newVersion;
  }

  private async saveMessageVersion(message: Message): Promise<void> {
    // Store the message
    const messageKey = this.redis.buildKey('messageData', message.id);
    await this.redis.getClient()?.setex(
      messageKey,
      60 * 60 * 24 * 7, // 1 week TTL
      JSON.stringify(message)
    );

    // Add to version history
    if (message.metadata?.originalMessageId) {
      const versionsKey = this.redis.buildKey(
        'messageVersions', 
        message.metadata.originalMessageId
      );
      await this.redis.getClient()?.rpush(versionsKey, message.id);
    }
  }
} 