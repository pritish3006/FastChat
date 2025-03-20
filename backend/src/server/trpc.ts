/**
 * tRPC Server Setup
 * 
 * Configures the tRPC server with WebSocket support
 */

import { initTRPC } from '@trpc/server';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { observable } from '@trpc/server/observable';
import { WebSocketServer, WebSocket } from 'ws';
import superjson from 'superjson';
import type { TRPCError } from '@trpc/server';

// Create context types
interface CreateContextOptions {
  wsContext?: CreateWSSContextFnOptions;
  httpContext?: CreateHTTPContextOptions;
}

// Create context based on request type
export async function createContext(opts: CreateHTTPContextOptions) {
  return {
    // Add any context you want to pass to your procedures
    httpContext: opts
  };
}

// Create WebSocket context
export async function createWSContext(opts: CreateWSSContextFnOptions) {
  return {
    // Add any context you want to pass to your procedures
    wsContext: opts
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

// Create WebSocket server
export function createWSServer(server: WebSocketServer) {
  return {
    on: (event: string, callback: (ws: WebSocket) => void) => {
      server.on(event, callback);
    },
    close: () => {
      server.close();
    }
  };
}