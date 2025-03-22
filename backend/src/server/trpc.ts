/**
 * tRPC Server Setup
 * 
 * Configures the tRPC server
 */

import { initTRPC } from '@trpc/server';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import type { TRPCError } from '@trpc/server';

// Create context based on request type
export async function createContext(opts: CreateHTTPContextOptions) {
  return {
    // Add any context you want to pass to your procedures
    httpContext: opts
  };
}

// Initialize tRPC
const t = initTRPC.context<typeof createContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof Error
            ? error.cause.message
            : null,
      },
    };
  },
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;