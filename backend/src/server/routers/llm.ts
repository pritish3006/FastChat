// @ts-nocheck
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { LLMService } from '../../services/llm';
import logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export const llmRouter = router({
  // Get available models
  listModels: publicProcedure
    .query(async () => {
      return global.llmService.listModels();
    }),

  // Create a new chat session
  createSession: publicProcedure
    .mutation(async () => {
      return global.llmService.startSession();
    }),

  // Get or create a session
  getSession: publicProcedure
    .input(z.object({
      sessionId: z.string().optional()
    }))
    .query(async ({ input }) => {
      return global.llmService.getOrCreateSession(input.sessionId || '');
    }),

  // Create a new branch
  createBranch: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      name: z.string(),
      parentMessageId: z.string(),
      metadata: z.record(z.any()).optional()
    }))
    .mutation(async ({ input }) => {
      return global.llmService.createBranch(
        input.sessionId,
        input.parentMessageId,
        {
          name: input.name,
          metadata: input.metadata
        }
      );
    }),

  // Switch branch
  switchBranch: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      branchId: z.string()
    }))
    .mutation(async ({ input }) => {
      return global.llmService.switchBranch(
        input.sessionId,
        input.branchId
      );
    }),

  // Get branch history
  getBranchHistory: publicProcedure
    .input(z.object({
      sessionId: z.string()
    }))
    .query(async ({ input }) => {
      return global.llmService.getBranchHistory(input.sessionId);
    }),

  setModel: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      modelId: z.string()
    }))
    .mutation(async ({ input }) => {
      return global.llmService.setModel(input.sessionId, input.modelId);
    }),

  updateModelConfig: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      config: z.object({
        temperature: z.number().min(0).max(1).optional(),
        topP: z.number().min(0).max(1).optional(),
        topK: z.number().optional()
      })
    }))
    .mutation(async ({ input }) => {
      return global.llmService.updateModelConfig(input.sessionId, input.config);
    })
});