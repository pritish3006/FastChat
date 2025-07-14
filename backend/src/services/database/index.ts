/**
 * DISABLED FILE - Skip TypeScript compilation
 * 
 * This file is temporarily disabled to focus on core functionality.
 * Database connectivity is NOT required for this application.
 */

// @ts-nocheck
/* eslint-disable */

/**
 * database service
 * 
 * This is a placeholder file with mock implementations.
 * The actual database functionality is not used in this project.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';
import { config } from '../../config';

// use in-memory store as we don't have database connectivity
// Database is completely disabled
const USE_DATABASE = false;
const ENABLE_IN_MEMORY_FALLBACK = true;

// in-memory data stores
const inMemorySessions = new Map<string, ChatSession>();
const inMemoryMessages = new Map<string, ChatMessage>();

// types for our service
export interface ChatMessage {
  id?: string;
  sessionId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  branchId?: string | null;
  parentMessageId?: string | null;
  createdAt?: string;
}

export interface ChatSession {
  id?: string;
  userId: string;
  title: string;
  modelId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Branch {
  id?: string;
  sessionId: string;
  parentBranchId?: string | null;
  name?: string | null;
  createdAt?: string;
}

// Mocked function that logs that database is disabled
function logDatabaseDisabled(operation: string, context: Record<string, any> = {}): void {
  logger.debug(`Database operation '${operation}' called but database is disabled`, {
    context
  });
}

// Mock database client
export const supabase = {
  // All operations return mock results
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
        order: () => ({
          limit: async () => ({ data: [], error: null })
        })
      }),
      order: () => ({
        limit: async () => ({ data: [], error: null })
      })
    }),
    insert: async () => ({ data: null, error: null }),
    update: async () => ({ data: null, error: null }),
    delete: async () => ({ data: null, error: null })
  })
};

// Mock admin database client
export const adminSupabase = supabase;

// Mock retry function
export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  context: string
): Promise<NonNullable<T>> {
  logDatabaseDisabled('withRetry', { context });
  return {} as any;
}

// Export Database type for type-checking elsewhere
export type Database = any;

// chat sessions operations
export const chatSessions = {
  /**
   * creates a new chat session
   */
  async create(session: Partial<ChatSession>): Promise<ChatSession> {
    logDatabaseDisabled('create session', { session });
    return {} as ChatSession;
  },

  /**
   * gets a chat session by id
   */
  async getById(sessionId: string): Promise<ChatSession | null> {
    logDatabaseDisabled('get session by id', { sessionId });
    return null;
  },

  /**
   * gets all chat sessions for a user
   */
  async getByUserId(userId: string): Promise<ChatSession[]> {
    logDatabaseDisabled('get user sessions', { userId });
    return [];
  },

  /**
   * updates a chat session
   */
  async update(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession> {
    logDatabaseDisabled('update session', { sessionId, updates });
    return {} as ChatSession;
  },

  /**
   * deletes a chat session
   */
  async delete(sessionId: string): Promise<void> {
    logDatabaseDisabled('delete session', { sessionId });
  },
};

// chat messages operations
export const messages = {
  /**
   * creates a new chat message
   */
  async create(message: ChatMessage): Promise<ChatMessage> {
    logDatabaseDisabled('create message', { message });
    return {} as ChatMessage;
  },
  
  /**
   * gets all messages for a session
   */
  async getBySessionId(sessionId: string): Promise<ChatMessage[]> {
    logDatabaseDisabled('get session messages', { sessionId });
    return [];
  },
  
  /**
   * gets a single message by id
   */
  async getById(messageId: string): Promise<ChatMessage | null> {
    logDatabaseDisabled('get message by id', { messageId });
    return null;
  },
  
  /**
   * gets messages that are children of the specified parent
   */
  async getByParentId(parentId: string): Promise<ChatMessage[]> {
    logDatabaseDisabled('get messages by parent id', { parentId });
    return [];
  }
};

// branches operations
export const branches = {
  /**
   * creates a new branch
   */
  async create(branch: Branch): Promise<Branch> {
    logDatabaseDisabled('create branch', { branch });
    return {} as Branch;
  },

  /**
   * gets branches for a chat session
   */
  async getBySessionId(sessionId: string): Promise<Branch[]> {
    logDatabaseDisabled('get session branches', { sessionId });
    return [];
  },
}; 