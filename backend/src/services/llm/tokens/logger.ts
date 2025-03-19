// import { SupabaseClient } from '@supabase/supabase-js';
// import logger from '../../../utils/logger';
// import { Message } from '../types';

// export interface TokenLogEntry {
//   session_id: string;
//   user_id: string;
//   message_id: string;
//   role: 'system' | 'user' | 'assistant';
//   text_length: number;
//   token_count: number;
//   model: string;
//   metadata?: Record<string, any>;
// }

// export class TokenLogger {
//   private supabase: SupabaseClient;
//   private readonly TABLE_NAME = 'token_logs';

//   constructor(supabase: SupabaseClient) {
//     this.supabase = supabase;
//   }

//   /**
//    * Log a token count entry to the database
//    */
//   async logTokenCount(entry: TokenLogEntry): Promise<void> {
//     try {
//       const { error } = await this.supabase
//         .from(this.TABLE_NAME)
//         .insert([entry]);

//       if (error) {
//         throw error;
//       }
//     } catch (error) {
//       logger.error('Failed to log token count:', error);
//       // Don't throw - we don't want token logging failures to break the chat flow
//     }
//   }

//   /**
//    * Get token usage for a specific user
//    */
//   async getUserTokenUsage(
//     userId: string,
//     startDate?: Date,
//     endDate?: Date
//   ): Promise<{
//     total_tokens: number;
//     prompt_tokens: number;
//     completion_tokens: number;
//     session_count: number;
//     message_count: number;
//   }> {
//     try {
//       const { data, error } = await this.supabase.rpc(
//         'get_user_token_usage',
//         {
//           p_user_id: userId,
//           p_start_date: startDate?.toISOString(),
//           p_end_date: endDate?.toISOString()
//         }
//       );

//       if (error) throw error;
//       return data[0] || {
//         total_tokens: 0,
//         prompt_tokens: 0,
//         completion_tokens: 0,
//         session_count: 0,
//         message_count: 0
//       };
//     } catch (error) {
//       logger.error('Failed to get user token usage:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get token usage for a specific session
//    */
//   async getSessionTokenUsage(
//     sessionId: string
//   ): Promise<{
//     total_tokens: number;
//     prompt_tokens: number;
//     completion_tokens: number;
//     message_count: number;
//     model: string;
//   }> {
//     try {
//       const { data, error } = await this.supabase.rpc(
//         'get_session_token_usage',
//         { p_session_id: sessionId }
//       );

//       if (error) throw error;
//       return data[0] || {
//         total_tokens: 0,
//         prompt_tokens: 0,
//         completion_tokens: 0,
//         message_count: 0,
//         model: ''
//       };
//     } catch (error) {
//       logger.error('Failed to get session token usage:', error);
//       throw error;
//     }
//   }

//   /**
//    * Get token usage analytics by time period
//    */
//   async getTokenUsageAnalytics(
//     interval: 'hour' | 'day' | 'week' | 'month' = 'day',
//     startDate?: Date,
//     endDate?: Date
//   ): Promise<Array<{
//     time_bucket: string;
//     total_tokens: number;
//     unique_users: number;
//     unique_sessions: number;
//     avg_tokens_per_message: number;
//   }>> {
//     try {
//       const { data, error } = await this.supabase.rpc(
//         'get_token_usage_analytics',
//         {
//           p_interval: interval,
//           p_start_date: startDate?.toISOString(),
//           p_end_date: endDate?.toISOString()
//         }
//       );

//       if (error) throw error;
//       return data || [];
//     } catch (error) {
//       logger.error('Failed to get token usage analytics:', error);
//       throw error;
//     }
//   }
// }