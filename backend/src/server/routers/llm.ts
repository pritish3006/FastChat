import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { LLMWebSocketManager, chatEventSchema } from '../../services/llm/websocket';
import { LLMService } from '../../services/llm';
import { RedisManager } from '../../services/llm/memory/redis';
import logger from '../../utils/logger';
import type { inferAsyncReturnType } from '@trpc/server';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

// Map to store WebSocket managers by context ID
const wsManagerMap = new Map<string, LLMWebSocketManager>();

// Function to get or create a WebSocket manager for a context
function getOrCreateWSManager(contextId: string): LLMWebSocketManager {
  let wsManager = wsManagerMap.get(contextId);
  if (!wsManager) {
    wsManager = new LLMWebSocketManager(
      global.llmService as LLMService,
      global.redisManager as RedisManager
    );
    wsManagerMap.set(contextId, wsManager);
  }
  return wsManager;
}

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
      return global.llmService.getOrCreateSession(input.sessionId);
    }),

  // Subscribe to chat events
  onChat: publicProcedure
    .input(chatEventSchema)
    .subscription(({ input, ctx }) => {
      // Get WebSocket manager instance for this context
      const contextId = (ctx.wsContext as any)?.connectionId || 'default';
      const wsManager = getOrCreateWSManager(contextId);

      // Return the subscription
      return wsManager.createChatSubscription(
        input.sessionId || uuidv4(),
        input.content,
        input.systemPrompt,
        input.parentMessageId
      );
    }),

  // Cancel a stream
  cancelStream: publicProcedure
    .input(z.object({
      streamId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      // Get WebSocket manager instance for this context
      const contextId = (ctx.wsContext as any)?.connectionId || 'default';
      const wsManager = getOrCreateWSManager(contextId);
      await wsManager.cancelStream(input.streamId);
      return { success: true };
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