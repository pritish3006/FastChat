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
let adminSupabase: SupabaseClient<Database>;

try {
  supabase = createClient<Database>(
    config.database.supabaseUrl,
    config.database.supabaseAnonKey // Use anon key for regular operations
  );
  
  // Admin client with service key (bypasses Row Level Security)
  adminSupabase = createClient<Database>(
    config.database.supabaseUrl,
    config.database.supabaseKey // Service key should only be used when RLS bypass is needed
  );
  
  logger.info('supabase clients initialized successfully');
  
  // Test the connection by making a simple query
  supabase.from('chat_sessions').select('count', { count: 'exact', head: true })
    .then(() => {
      logger.info('supabase connection test successful');
    })
    .catch((error) => {
      // Don't throw here, just log the error
      logger.warn('supabase connection test failed (tables may not exist yet)', { 
        error: error?.message || String(error),
        hint: 'This is normal during initial setup or if database migrations haven\'t been run yet'
      });
    });
} catch (error) {
  logger.error('failed to initialize supabase client', { 
    error: error?.message || String(error),
    stack: error?.stack
  });
  
  // Create dummy clients to prevent application crashes
  // This allows the app to start even with database issues
  supabase = createEmptyClient();
  adminSupabase = createEmptyClient();
}

/**
 * Creates an empty supabase client with mock methods
 * This is used as a fallback when the real client fails to initialize
 * to prevent the application from crashing
 */
function createEmptyClient() {
  const mockClient = {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: { message: 'Database connection failed' } }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      update: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      delete: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      upsert: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      eq: () => ({ data: null, error: { message: 'Database connection failed' } }),
    }),
    auth: {
      signIn: () => Promise.resolve({ data: null, error: { message: 'Database connection failed' } }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({ data: null, error: null }),
    }
  };
  
  return mockClient as unknown as SupabaseClient<Database>;
}

export { adminSupabase };
export default supabase; 