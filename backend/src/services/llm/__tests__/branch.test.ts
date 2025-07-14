// backend/src/services/llm/memory/redis.ts
export interface RedisConfig {
  enabled: boolean;
  url: string;
  prefix?: string;
  
}import { BranchManager } from '../memory/branch';
import { RedisManager } from '../memory/redis';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock Redis client
jest.mock('../memory/redis', () => {
  return {
    RedisManager: jest.fn().mockImplementation(() => ({
      buildKey: jest.fn((prefix, id) => `${prefix}:${id}`),
      getClient: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        lrange: jest.fn(),
        lpush: jest.fn(),
        del: jest.fn(),
      })),
      getSession: jest.fn(),
      saveSession: jest.fn(),
    })),
  };
});

describe('BranchManager', () => {
  let branchManager: BranchManager;
  let redisManager: RedisManager;
  const mockSessionId = uuidv4();
  const mockMessageId = uuidv4();

  beforeEach(() => {
    redisManager = new RedisManager({
      url: 'redis://localhost:6379',
    });
    branchManager = new BranchManager(redisManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBranch', () => {
    it('should create a new branch from an existing message', async () => {
      const mockMessage: Message = {
        id: mockMessageId,
        sessionId: mockSessionId,
        role: 'user',
        content: 'Test message',
        timestamp: Date.now(),
      };

      // Mock getMessage to return our test message
      jest.spyOn(branchManager as any, 'getMessage').mockResolvedValue(mockMessage);
      jest.spyOn(branchManager as any, 'saveBranch').mockResolvedValue(undefined);
      jest.spyOn(branchManager as any, 'addBranchToSession').mockResolvedValue(undefined);
      jest.spyOn(branchManager as any, 'trackBranchHistory').mockResolvedValue(undefined);

      const branchOptions = {
        name: 'Test Branch',
        metadata: { test: true },
      };

      const result = await branchManager.createBranch(
        mockSessionId,
        mockMessageId,
        branchOptions
      );

      expect(result).toMatchObject({
        sessionId: mockSessionId,
        name: branchOptions.name,
        originMessageId: mockMessageId,
        metadata: branchOptions.metadata,
        isActive: false,
        isArchived: false,
      });
    });

    it('should throw error when origin message not found', async () => {
      jest.spyOn(branchManager as any, 'getMessage').mockResolvedValue(null);

      await expect(
        branchManager.createBranch(mockSessionId, mockMessageId)
      ).rejects.toThrow('Origin message not found');
    });
  });

  describe('getBranches', () => {
    it('should return empty array when session has no branches', async () => {
      jest.spyOn(redisManager, 'getSession').mockResolvedValue(null);

      const result = await branchManager.getBranches(mockSessionId);
      expect(result).toEqual([]);
    });

    it('should return all non-archived branches for a session', async () => {
      const mockBranches = [
        {
          id: uuidv4(),
          name: 'Branch 1',
          sessionId: mockSessionId,
          isArchived: false,
        },
        {
          id: uuidv4(),
          name: 'Branch 2',
          sessionId: mockSessionId,
          isArchived: true,
        },
      ];

      jest.spyOn(redisManager, 'getSession').mockResolvedValue({
        id: mockSessionId,
        branches: mockBranches.map(b => b.id),
      });

      jest.spyOn(branchManager, 'getBranch')
        .mockImplementation(async (branchId) => {
          return mockBranches.find(b => b.id === branchId) || null;
        });

      const result = await branchManager.getBranches(mockSessionId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Branch 1');
    });
  });

  describe('editMessage', () => {
    it('should create a new version of the message', async () => {
      const originalMessage: Message = {
        id: mockMessageId,
        sessionId: mockSessionId,
        role: 'user',
        content: 'Original content',
        timestamp: Date.now(),
      };

      jest.spyOn(branchManager as any, 'getMessage').mockResolvedValue(originalMessage);
      jest.spyOn(branchManager as any, 'saveMessageVersion').mockResolvedValue(undefined);
      jest.spyOn(branchManager as any, 'trackBranchHistory').mockResolvedValue(undefined);

      const newContent = 'Updated content';
      const result = await branchManager.editMessage(mockMessageId, newContent);

      expect(result).toMatchObject({
        content: newContent,
        sessionId: mockSessionId,
        role: 'user',
      });
    });

    it('should throw error when message not found', async () => {
      jest.spyOn(branchManager as any, 'getMessage').mockResolvedValue(null);

      await expect(
        branchManager.editMessage(mockMessageId, 'New content')
      ).rejects.toThrow('Message not found');
    });
  });

  describe('switchBranch', () => {
    const mockBranchId = uuidv4();

    it('should throw error when branch not found', async () => {
      jest.spyOn(branchManager, 'getBranch').mockResolvedValue(null);

      await expect(
        branchManager.switchBranch(mockSessionId, mockBranchId)
      ).rejects.toThrow('Branch not found');
    });

    it('should throw error when branch belongs to different session', async () => {
      jest.spyOn(branchManager, 'getBranch').mockResolvedValue({
        id: mockBranchId,
        sessionId: 'different-session',
        name: 'Test Branch',
        originMessageId: mockMessageId,
        createdAt: Date.now(),
        depth: 0,
      });

      await expect(
        branchManager.switchBranch(mockSessionId, mockBranchId)
      ).rejects.toThrow('Branch does not belong to this session');
    });
  });
});
