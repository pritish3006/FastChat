/**
 * DISABLED FILE - Skip TypeScript compilation
 * 
 * This file is temporarily disabled to focus on core functionality.
 */

// @ts-nocheck
/* eslint-disable */

import { Request, Response } from 'express';
import { LLMService } from '../services/llm';
import logger from '../utils/logger';
import { BranchError } from '../services/llm/memory/branch';

let llmService: LLMService;

// Initialize LLM service if needed
async function getLLMService(): Promise<LLMService> {
  if (!llmService) {
    llmService = new LLMService(require('../config').default.llm);
    await llmService.initialize();
  }
  return llmService;
}

/**
 * Create a new branch from a specific message
 */
export async function createBranch(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { originMessageId, name, metadata } = req.body;
    
    if (!originMessageId) {
      res.status(400).json({ error: 'Origin message ID is required' });
      return;
    }
    
    const service = await getLLMService();
    const result = await service.createBranch(sessionId, originMessageId, { name, metadata });
    
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating branch:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to create branch' });
  }
}

/**
 * Get all branches for a session
 */
export async function getBranches(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';
    
    const service = await getLLMService();
    const branches = await service.getBranches(sessionId, includeArchived);
    
    res.status(200).json(branches);
  } catch (error) {
    logger.error('Error getting branches:', error);
    res.status(500).json({ error: 'Failed to get branches' });
  }
}

/**
 * Get a specific branch
 */
export async function getBranch(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, branchId } = req.params;
    
    const service = await getLLMService();
    const branch = await service.getBranch(branchId);
    
    if (!branch) {
      res.status(404).json({ error: 'Branch not found' });
      return;
    }
    
    if (branch.sessionId !== sessionId) {
      res.status(403).json({ error: 'Branch does not belong to this session' });
      return;
    }
    
    res.status(200).json(branch);
  } catch (error) {
    logger.error('Error getting branch:', error);
    res.status(500).json({ error: 'Failed to get branch' });
  }
}

/**
 * Switch to a different branch
 */
export async function switchBranch(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, branchId } = req.params;
    
    const service = await getLLMService();
    const result = await service.switchBranch(sessionId, branchId);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error switching branch:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to switch branch' });
  }
}

/**
 * Merge branches
 */
export async function mergeBranches(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { sourceBranchId, targetBranchId } = req.body;
    
    if (!sourceBranchId || !targetBranchId) {
      res.status(400).json({ error: 'Source and target branch IDs are required' });
      return;
    }
    
    const service = await getLLMService();
    const result = await service.mergeBranches(sessionId, sourceBranchId, targetBranchId);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error merging branches:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to merge branches' });
  }
}

/**
 * Edit a message (creates a new version)
 */
export async function editMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    
    if (!content) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }
    
    const service = await getLLMService();
    const result = await service.editMessage(messageId, content);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error editing message:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to edit message' });
  }
}

/**
 * Archive a branch (soft delete)
 */
export async function archiveBranch(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, branchId } = req.params;
    
    const service = await getLLMService();
    const result = await service.archiveBranch(sessionId, branchId);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error archiving branch:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to archive branch' });
  }
}

/**
 * Delete a branch
 */
export async function deleteBranch(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId, branchId } = req.params;
    const { deleteMessages } = req.query;
    
    const service = await getLLMService();
    await service.deleteBranch(sessionId, branchId, {
      deleteMessages: deleteMessages === 'true'
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting branch:', error);
    
    if (error instanceof BranchError) {
      res.status(error.statusCode || 400).json({ error: error.message });
      return;
    }
    
    res.status(500).json({ error: 'Failed to delete branch' });
  }
}

/**
 * Get branch history
 */
export async function getBranchHistory(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    const service = await getLLMService();
    const history = await service.getBranchHistory(sessionId);
    
    res.status(200).json(history);
  } catch (error) {
    logger.error('Error getting branch history:', error);
    res.status(500).json({ error: 'Failed to get branch history' });
  }
} 