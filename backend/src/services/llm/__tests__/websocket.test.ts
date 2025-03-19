const http = require('http');
const WebSocket = require('ws');
const { createTRPCProxyClient, httpBatchLink } = require('@trpc/client');
const superjson = require('superjson');
const { LLMService } = require('../index');
const { RedisManager } = require('../memory/redis');
const { appRouter } = require('../../../server/routers');
const { createContext } = require('../../../server/context');
const { WebSocketManager } = require('../websocket');
import { createWSClient, wsLink } from '@trpc/client';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { AppRouter } from '../../../server/routers';
import type { IncomingMessage } from 'http';
import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';

// Configure timeout for all tests
jest.setTimeout(30000);

describe('WebSocket Integration Tests', () => {
  let llmService: typeof LLMService;
  let redisManager: typeof RedisManager;
  let wsManager: typeof WebSocketManager;
  let httpServer: ReturnType<typeof http.createServer>;
  let port: number;
  let client: ReturnType<typeof createTRPCProxyClient>;
  let wss: WebSocketServer;
  let wsHandler: ReturnType<typeof applyWSSHandler>;

  beforeAll(async () => {
    try {
      // Create HTTP server
      httpServer = http.createServer();
      port = 3001;
      await new Promise<void>((resolve) => httpServer.listen(port, resolve));

      // Initialize services
      llmService = new LLMService();
      redisManager = new RedisManager();
      global.llmService = llmService;
      global.redisManager = redisManager;

      // Create WebSocket server
      wss = new WebSocketServer({ server: httpServer });
      wsManager = new WebSocketManager(llmService, redisManager);

      // Set global services for tRPC router
      wsHandler = applyWSSHandler({
        wss,
        router: appRouter,
        createContext
      });

      // Create WebSocket client
      const wsClient = createWSClient({
        url: `ws://localhost:${port}`
      });

      // Create tRPC client
      client = createTRPCProxyClient({
        links: [wsLink({ client: wsClient })],
        transformer: superjson
      });
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    // Close all connections and cleanup
    if (wsHandler) {
      for (const client of wss.clients) {
        client.close();
      }
    }
    wss?.close();
    httpServer?.close();
  });

  it('should handle chat messages through tRPC subscription', async () => {
    const sessionId = uuidv4();
    const messages: string[] = [];
    let subscriptionId: string | undefined;

    return new Promise<void>((resolve, reject) => {
      const subscription = client.chat.onMessage.subscribe(
        { sessionId },
        {
          onData: (data: { content: string; role: string }) => {
            messages.push(data.content);
            if (messages.length === 2) {
              subscription.unsubscribe();
              resolve();
            }
          },
          onError: (err: Error) => {
            subscription.unsubscribe();
            reject(err);
          }
        }
      );

      // Send test messages
      setTimeout(async () => {
        try {
          await client.chat.sendMessage.mutate({
            sessionId,
            content: 'Hello',
            role: 'user'
          });
        } catch (error) {
          reject(error);
        }
      }, 100);
    });
  });

  it('should handle stream cancellation', async () => {
    const sessionId = uuidv4();
    let subscriptionId: string | undefined;

    return new Promise<void>((resolve, reject) => {
      const subscription = client.chat.onMessage.subscribe(
        { sessionId },
        {
          onData: (data: { content: string; role: string }) => {
            if (data.content.includes('cancelled')) {
              subscription.unsubscribe();
              resolve();
            }
          },
          onError: (err: Error) => {
            subscription.unsubscribe();
            reject(err);
          }
        }
      );

      // Send message and cancel
      setTimeout(async () => {
        try {
          await client.chat.sendMessage.mutate({
            sessionId,
            content: 'Generate a long response',
            role: 'user'
          });

          // Cancel after a short delay
          setTimeout(async () => {
            await client.chat.cancelStream.mutate({ sessionId });
          }, 100);
        } catch (error) {
          reject(error);
        }
      }, 100);
    });
  });

  it('should maintain context across messages', async () => {
    const sessionId = uuidv4();
    const messages: string[] = [];

    return new Promise<void>((resolve, reject) => {
      const subscription = client.chat.onMessage.subscribe(
        { sessionId },
        {
          onData: (data: { content: string; role: string }) => {
            messages.push(data.content);
            if (messages.length === 2) {
              subscription.unsubscribe();
              expect(messages[1]).toContain(messages[0]);
              resolve();
            }
          },
          onError: (err: Error) => {
            subscription.unsubscribe();
            reject(err);
          }
        }
      );

      // Send sequential messages
      setTimeout(async () => {
        try {
          await client.chat.sendMessage.mutate({
            sessionId,
            content: 'What is your name?',
            role: 'user'
          });

          setTimeout(async () => {
            await client.chat.sendMessage.mutate({
              sessionId,
              content: 'Can you repeat what I just asked?',
              role: 'user'
            });
          }, 1000);
        } catch (error) {
          reject(error);
        }
      }, 100);
    });
  });
}); 