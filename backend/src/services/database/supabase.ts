// @ts-nocheck
/**
 * supabase service
 * 
 * handles database connections and operations using supabase.
 * provides typed helpers for working with specific tables.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/index';
import logger from '../../utils/logger';

// define database types
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          username: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          model_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          model_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          model_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          content: string;
          role: 'user' | 'assistant' | 'system';
          created_at: string;
          branch_id: string | null;
          parent_message_id: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          content: string;
          role: 'user' | 'assistant' | 'system';
          created_at?: string;
          branch_id?: string | null;
          parent_message_id?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          content?: string;
          role?: 'user' | 'assistant' | 'system';
          created_at?: string;
          branch_id?: string | null;
          parent_message_id?: string | null;
        };
      };
      branches: {
        Row: {
          id: string;
          session_id: string;
          parent_branch_id: string | null;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          parent_branch_id?: string | null;
          name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          parent_branch_id?: string | null;
          name?: string | null;
          created_at?: string;
        };
      };
    };
  };
};

// create and export the supabase client
let supabase: SupabaseClient<Database>;

try {
  supabase = createClient<Database>(
    config.database.supabaseUrl,
    config.database.supabaseKey
  );
  
  logger.info('supabase client initialized successfully');
} catch (error) {
  logger.error('failed to initialize supabase client', { error });
  throw new Error('database connection failed');
}

export default supabase; 