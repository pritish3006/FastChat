// @ts-nocheck
/**
 * database service
 * 
 * provides methods for interacting with the database.
 * abstracts away the underlying database provider (supabase).
 */

import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase';
import logger from '../../utils/logger';
import { ApiError } from '../../middleware/errorHandler';

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

// chat sessions operations
export const chatSessions = {
  /**
   * creates a new chat session
   */
  async create(session: ChatSession): Promise<ChatSession> {
    try {
      const newSession = {
        id: session.id || uuidv4(),
        user_id: session.userId,
        title: session.title,
        model_id: session.modelId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('chat_sessions')
        .insert(newSession)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('failed to create chat session', { error });
      throw new ApiError(500, 'failed to create chat session');
    }
  },

  /**
   * gets a chat session by id
   */
  async getById(sessionId: string): Promise<ChatSession | null> {
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // not found
        }
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('failed to get chat session', { error, sessionId });
      throw new ApiError(500, 'failed to get chat session');
    }
  },

  /**
   * gets all chat sessions for a user
   */
  async getByUserId(userId: string): Promise<ChatSession[]> {
    try {
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
      logger.error('failed to get user chat sessions', { error, userId });
      throw new ApiError(500, 'failed to get chat sessions');
    }
  },

  /**
   * updates a chat session
   */
  async update(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession> {
    try {
      const sessionUpdates = {
        ...(updates.title && { title: updates.title }),
        ...(updates.modelId && { model_id: updates.modelId }),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('chat_sessions')
        .update(sessionUpdates)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        modelId: data.model_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      logger.error('failed to update chat session', { error, sessionId });
      throw new ApiError(500, 'failed to update chat session');
    }
  },

  /**
   * deletes a chat session
   */
  async delete(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      logger.error('failed to delete chat session', { error, sessionId });
      throw new ApiError(500, 'failed to delete chat session');
    }
  },
};

// messages operations
export const messages = {
  /**
   * creates a new message
   */
  async create(message: ChatMessage): Promise<ChatMessage> {
    try {
      const newMessage = {
        id: message.id || uuidv4(),
        session_id: message.sessionId,
        content: message.content,
        role: message.role,
        created_at: new Date().toISOString(),
        branch_id: message.branchId || null,
        parent_message_id: message.parentMessageId || null,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert(newMessage)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        sessionId: data.session_id,
        content: data.content,
        role: data.role,
        branchId: data.branch_id,
        parentMessageId: data.parent_message_id,
        createdAt: data.created_at,
      };
    } catch (error) {
      logger.error('failed to create message', { error });
      throw new ApiError(500, 'failed to create message');
    }
  },

  /**
   * gets messages for a chat session
   */
  async getBySessionId(sessionId: string, branchId?: string | null): Promise<ChatMessage[]> {
    try {
      let query = supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      } else {
        query = query.is('branch_id', null);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map(message => ({
        id: message.id,
        sessionId: message.session_id,
        content: message.content,
        role: message.role,
        branchId: message.branch_id,
        parentMessageId: message.parent_message_id,
        createdAt: message.created_at,
      }));
    } catch (error) {
      logger.error('failed to get session messages', { error, sessionId });
      throw new ApiError(500, 'failed to get messages');
    }
  },

  /**
   * updates a message
   */
  async update(messageId: string, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    try {
      const messageUpdates = {
        ...(updates.content && { content: updates.content }),
        ...(updates.branchId !== undefined && { branch_id: updates.branchId }),
      };

      const { data, error } = await supabase
        .from('messages')
        .update(messageUpdates)
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        sessionId: data.session_id,
        content: data.content,
        role: data.role,
        branchId: data.branch_id,
        parentMessageId: data.parent_message_id,
        createdAt: data.created_at,
      };
    } catch (error) {
      logger.error('failed to update message', { error, messageId });
      throw new ApiError(500, 'failed to update message');
    }
  },
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