// @ts-nocheck
/**
 * supabase service
 * 
 * handles database connections and operations using supabase.
 * provides typed helpers for working with specific tables.
 */

import { createClient, SupabaseClient, PostgrestResponse, PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js';
import { config } from '../../config/index';
import logger from '../../utils/logger';

// Constants for retry mechanism
const MAX_RETRIES = 3;  // Maximum number of retry attempts
const INITIAL_RETRY_DELAY = 100;  // Initial delay in ms (will be exponentially increased)
const MAX_RETRY_DELAY = 3000;  // Maximum delay between retries in ms

/**
 * Utility function to implement exponential backoff retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }> | { then(onfulfilled: (value: { data: T | null; error: any }) => any): any },
  context: string,
  maxRetries: number = MAX_RETRIES
): Promise<NonNullable<T>> {
  let lastError: PostgrestError | Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await Promise.resolve(operation());
      
      if (error) {
        lastError = error;
        // If it's a rate limit error, always retry
        if (error.code === '429') {
          logger.warn(`Rate limit hit during ${context}, attempt ${attempt}/${maxRetries}`);
          continue;
        }
        // If it's a connection error, retry
        if (error.code?.startsWith('5') || error.code === 'EAI_AGAIN') {
          logger.warn(`Transient error during ${context}, attempt ${attempt}/${maxRetries}`, { 
            error: error.message,
            code: error.code 
          });
          continue;
        }
        // For other errors, don't retry
        throw error;
      }

      if (!data) {
        throw new Error(`No data returned for ${context}`);
      }

      if (attempt > 1) {
        logger.info(`Operation ${context} succeeded after ${attempt} attempts`);
      }
      
      return data as NonNullable<T>;
    } catch (error) {
      lastError = error as Error;
      // Don't retry on client errors (4xx)
      if ('code' in error && error.code?.startsWith('4')) {
        throw error;
      }
      logger.warn(`Error during ${context}, attempt ${attempt}/${maxRetries}`, { 
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Calculate delay with exponential backoff and jitter
    const delay = Math.min(
      INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1) + Math.random() * 100,
      MAX_RETRY_DELAY
    );
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // If we get here, all retries failed
  logger.error(`All ${maxRetries} retry attempts failed for ${context}`, { lastError });
  throw lastError;
}

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
  // Connection pooling and optimization settings
  const clientOptions = {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: { 'x-application-name': 'fast-chat' }
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  };

  supabase = createClient<Database>(
    config.database.supabaseUrl,
    config.database.supabaseAnonKey,
    clientOptions
  );
  
  adminSupabase = createClient<Database>(
    config.database.supabaseUrl,
    config.database.supabaseKey,
    clientOptions
  );
  
  logger.info('supabase clients initialized successfully');
  
  // Test the connection by making a simple query
  withRetry(
    () => supabase.from('chat_sessions').select('count', { count: 'exact', head: true }),
    'initial connection test'
  ).then(() => {
    logger.info('supabase connection test successful');
  }).catch((error) => {
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