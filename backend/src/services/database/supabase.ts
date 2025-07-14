// @ts-nocheck
/**
 * supabase service
 * 
 * DISABLED MODULE - No Supabase functionality is used in this application.
 * This module provides mock implementations to prevent runtime errors.
 */

import { config } from '../../config/index';
import logger from '../../utils/logger';

// Mock client for types only
const mockClient = {} as any;

/**
 * Utility function to implement exponential backoff retry logic
 * This is a mock implementation that does not actually perform retries
 */
export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }> | { then(onfulfilled: (value: { data: T | null; error: any }) => any): any },
  context: string
): Promise<NonNullable<T>> {
  logger.debug(`Mock withRetry called for: ${context}`);
  return {} as any;
}

// Database type definitions for TypeScript compatibility
export type Database = {
  public: {
    Tables: {
      users: any;
      chat_sessions: any;
      messages: any;
      branches: any;
    };
  };
};

// Export mock clients that won't try to connect to anything
export const supabase = createEmptyClient();
export const adminSupabase = createEmptyClient();

/**
 * Creates a mock Supabase client that doesn't attempt to connect to a real database
 */
function createEmptyClient(): any {
  logger.info('Creating mock Supabase client - database functionality is disabled');
  
  // Return a mock object that matches the Supabase client interface
  return {
    auth: {
      signUp: async () => ({ data: null, error: null }),
      signIn: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null }, error: null })
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null })
        }),
        order: () => ({
          limit: async () => ({ data: [], error: null })
        }),
        match: () => ({
          limit: async () => ({ data: [], error: null })
        })
      }),
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      delete: async () => ({ data: null, error: null })
    }),
    storage: {
      from: (bucket: string) => ({
        upload: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } })
      })
    }
  };
}

// No initialization is performed
logger.info('Supabase clients initialized as mock objects (Supabase is disabled)');

export default supabase; 