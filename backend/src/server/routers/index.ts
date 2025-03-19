/**
 * Main tRPC Router
 * 
 * Combines all sub-routers into a single application router
 */

import { router } from '../trpc';
import { llmRouter } from './llm';

export const appRouter = router({
  llm: llmRouter,
  // Add other routers here as needed
});

// Export type definition of API
export type AppRouter = typeof appRouter; 