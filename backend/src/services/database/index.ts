/**
 * database service
 * 
 * provides methods for interacting with the database.
 * abstracts away the underlying database provider (supabase).
 */

import { v4 as uuidv4 } from 'uuid';
import supabase, { adminSupabase } from './supabase';
import logger from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';
import config from '../../config';

// use in-memory store if database is unavailable or disabled
const USE_DATABASE = config.database.useDatabase;
const ENABLE_IN_MEMORY_FALLBACK = config.database.enableInMemoryFallback;

// in-memory data stores for fallback
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

// utility function to handle database errors consistently
function handleDatabaseError(error: any, operation: string, context: Record<string, any> = {}): never {
  // Log the error with context
  logger.error(`Database error during ${operation}`, {
    error: error?.message || String(error),
    errorCode: error?.code,
    context
  });
  
  // If fallback is enabled, don't throw - the caller can use in-memory fallback
  if (ENABLE_IN_MEMORY_FALLBACK) {
    // Return a fake success response or default value
    return null as never;
  }
  
  // Otherwise, throw a proper API error
  throw new ApiError(503, `Database unavailable: ${operation}`, { context });
}

// chat sessions operations
export const chatSessions = {
  /**
   * creates a new chat session
   */
  async create(session: Partial<ChatSession>): Promise<ChatSession> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        // Ensure userId is defined
        if (!session.userId) {
          throw new Error('userId is required for creating a chat session');
        }
        
        const newSession = {
          id: session.id || uuidv4(),
          userId: session.userId,
          title: session.title || 'New Conversation',
          modelId: session.modelId || 'llama3',
          createdAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString()
        };
        inMemorySessions.set(newSession.id, newSession);
        return newSession;
      }
      
      const newSession = {
        id: session.id || uuidv4(),
        user_id: session.userId,
        title: session.title,
        model_id: session.modelId
      };
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert(newSession)
        .select('*')
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error) {
      handleDatabaseError(error, 'create session', { 
        userId: session.userId, 
        title: session.title 
      });
    }
  },

  /**
   * gets a chat session by id
   */
  async getById(sessionId: string): Promise<ChatSession | null> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        const session = inMemorySessions.get(sessionId);
        return session || null;
      }
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
      }
      
      return data ? {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      } : null;
    } catch (error) {
      handleDatabaseError(error, 'get session by id', { sessionId });
    }
  },

  /**
   * gets all chat sessions for a user
   */
  async getByUserId(userId: string): Promise<ChatSession[]> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        return Array.from(inMemorySessions.values())
          .filter(session => session.userId === userId);
      }
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      
      return data.map(session => ({
        id: session.id,
        userId: session.user_id,
        title: session.title,
        modelId: session.model_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      }));
    } catch (error) {
      handleDatabaseError(error, 'get user sessions', { userId });
      return []; // Return empty array instead of failing completely
    }
  },

  /**
   * updates a chat session
   */
  async update(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        const session = inMemorySessions.get(sessionId);
        if (!session) {
          throw new Error('Session not found');
        }
        
        const updatedSession = {
          ...session,
          title: updates.title || session.title,
          modelId: updates.modelId || session.modelId,
          updatedAt: new Date().toISOString()
        };
        
        inMemorySessions.set(sessionId, updatedSession);
        return updatedSession;
      }
      
      const updateData: any = {};
      if (updates.title) updateData.title = updates.title;
      if (updates.modelId) updateData.model_id = updates.modelId;
      
      const { data, error } = await supabase
        .from('chat_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select('*')
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
    } catch (error) {
      handleDatabaseError(error, 'update session', { sessionId, updates });
    }
  },

  /**
   * deletes a chat session
   */
  async delete(sessionId: string): Promise<void> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        inMemorySessions.delete(sessionId);
        // Delete associated messages
        const messagesToRemove: string[] = [];
        inMemoryMessages.forEach((message, key) => {
          if (message.sessionId === sessionId) {
            messagesToRemove.push(key);
          }
        });
        messagesToRemove.forEach(key => inMemoryMessages.delete(key));
        return;
      }
      
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);
      
      if (error) throw error;
    } catch (error) {
      handleDatabaseError(error, 'delete session', { sessionId });
    }
  },
};

// chat messages operations
export const messages = {
  /**
   * creates a new chat message
   */
  async create(message: ChatMessage): Promise<ChatMessage> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        const newMessage = {
          id: message.id || uuidv4(),
          sessionId: message.sessionId,
          content: message.content,
          role: message.role,
          branchId: message.branchId || null,
          parentMessageId: message.parentMessageId || null,
          createdAt: new Date().toISOString()
        };
        inMemoryMessages.set(newMessage.id, newMessage);
        return newMessage;
      }
      
      const newMessage = {
        id: message.id || uuidv4(),
        session_id: message.sessionId,
        content: message.content,
        role: message.role,
        branch_id: message.branchId || null,
        parent_message_id: message.parentMessageId || null
      };
      
      const { data, error } = await supabase
        .from('messages')
        .insert(newMessage)
        .select('*')
        .single();
      
      if (error) throw error;
      
      return {
        id: data.id,
        sessionId: data.session_id,
        content: data.content,
        role: data.role,
        branchId: data.branch_id,
        parentMessageId: data.parent_message_id,
        createdAt: data.created_at
      };
    } catch (error) {
      // Don't completely fail the application, just log the error
      // This is especially important for chat functionality to continue working
      logger.error('Failed to save message', { 
        error: error instanceof Error ? error.message : String(error),
        sessionId: message.sessionId
      });
      
      // Return a fake message so the application can continue
      return {
        id: message.id || uuidv4(),
        sessionId: message.sessionId,
        content: message.content,
        role: message.role,
        branchId: message.branchId,
        parentMessageId: message.parentMessageId,
        createdAt: new Date().toISOString()
      };
    }
  },
  
  /**
   * gets all messages for a session
   */
  async getBySessionId(sessionId: string): Promise<ChatMessage[]> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        return Array.from(inMemoryMessages.values())
          .filter(message => message.sessionId === sessionId)
          .sort((a, b) => {
            // Ensure createdAt is not undefined before creating Date objects
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
          });
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      return data.map(message => ({
        id: message.id,
        sessionId: message.session_id,
        content: message.content,
        role: message.role,
        branchId: message.branch_id,
        parentMessageId: message.parent_message_id,
        createdAt: message.created_at
      }));
    } catch (error) {
      logger.error('Failed to get session messages', { 
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });
      
      // Return empty array instead of failing so the application can continue
      return [];
    }
  },
  
  /**
   * gets a single message by id
   */
  async getById(messageId: string): Promise<ChatMessage | null> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        return inMemoryMessages.get(messageId) || null;
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // not found
        throw error;
      }
      
      return {
        id: data.id,
        sessionId: data.session_id,
        content: data.content,
        role: data.role,
        branchId: data.branch_id,
        parentMessageId: data.parent_message_id,
        createdAt: data.created_at
      };
    } catch (error) {
      logger.error('Failed to get message by id', { 
        error: error instanceof Error ? error.message : String(error),
        messageId
      });
      return null;
    }
  },
  
  /**
   * gets messages that are children of the specified parent
   */
  async getByParentId(parentId: string): Promise<ChatMessage[]> {
    try {
      if (!USE_DATABASE) {
        // In-memory fallback
        return Array.from(inMemoryMessages.values())
          .filter(message => message.parentMessageId === parentId)
          .sort((a, b) => {
            // Ensure createdAt is not undefined before creating Date objects
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
          });
      }
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('parent_message_id', parentId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      return data.map(message => ({
        id: message.id,
        sessionId: message.session_id,
        content: message.content,
        role: message.role,
        branchId: message.branch_id,
        parentMessageId: message.parent_message_id,
        createdAt: message.created_at
      }));
    } catch (error) {
      logger.error('Failed to get messages by parent id', { 
        error: error instanceof Error ? error.message : String(error),
        parentId
      });
      return [];
    }
  }
};

// branches operations
export const branches = {
  /**
   * creates a new branch
   */
  async create(branch: Branch): Promise<Branch> {
    try {
      const newBranch = {
        id: branch.id || uuidv4(),
        session_id: branch.sessionId,
        parent_branch_id: branch.parentBranchId || null,
        name: branch.name || null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('branches')
        .insert(newBranch)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        sessionId: data.session_id,
        parentBranchId: data.parent_branch_id,
        name: data.name,
        createdAt: data.created_at,
      };
    } catch (error) {
      logger.error('failed to create branch', { error });
      throw new ApiError(500, 'failed to create branch');
    }
  },

  /**
   * gets branches for a chat session
   */
  async getBySessionId(sessionId: string): Promise<Branch[]> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at');

      if (error) throw error;

      return data.map(branch => ({
        id: branch.id,
        sessionId: branch.session_id,
        parentBranchId: branch.parent_branch_id,
        name: branch.name,
        createdAt: branch.created_at,
      }));
    } catch (error) {
      logger.error('failed to get session branches', { error, sessionId });
      throw new ApiError(500, 'failed to get branches');
    }
  },
}; 