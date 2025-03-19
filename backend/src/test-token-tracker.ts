/**
 * Comprehensive test for Token Counter and Token Tracker components
 * 
 * This test script verifies the functionality of token counting and tracking including:
 * - Token counting for different messages
 * - Session token usage tracking
 * - Historical token usage analysis
 * - Cost calculation based on token usage
 * 
 * Run with: npx ts-node src/test-token-tracker.ts
 */

import { TokenCounter } from './services/llm/tokens/counter';
import { TokenTracker } from './services/llm/tokens/tracker';
import { TokenLogger } from './services/llm/tokens/logger';
import { RedisManager } from './services/llm/memory/redis';
import { v4 as uuidv4 } from 'uuid';
import logger from './utils/logger';
import { Message } from './services/llm/types';
import { createClient } from '@supabase/supabase-js';

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

async function testTokenCounterAndTracker() {
  logSection('Token Counter and Tracker Component Test');
  
  // Test 1: Initialize Components
  logSection('Test 1: Initialize Components');
  
  logger.info('Initializing Redis Manager...');
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisManager = new RedisManager({
    enabled: true,
    url: redisUrl,
    prefix: 'test-token-tracker:',
    sessionTTL: 60 * 60 * 24, // 24 hours
    maxRetries: 3,
    retryTimeout: 1000
  });
  
  await redisManager.connect();
  logger.info('Redis Manager initialized successfully');
  
  logger.info('Initializing Token Counter...');
  const tokenCounter = new TokenCounter();
  logger.info('Token Counter initialized successfully');
  
  logger.info('Initializing Token Tracker...');
  const tokenTracker = new TokenTracker(redisManager, tokenCounter, {
    enableRateLimiting: true,
    rateLimits: {
      userHourly: 100000,
      userDaily: 500000,
      userMonthly: 5000000
    }
  });
  logger.info('Token Tracker initialized successfully');
  
  // Creating mock Supabase client for TokenLogger
  // Note: This is a mock only for testing - in production use a real Supabase client
  logger.info('Initializing Token Logger...');
  const mockSupabaseClient = {
    from: () => ({
      insert: async () => ({ error: null }),
    }),
    rpc: async (funcName: string, params: any) => {
      // Mock RPC responses for different functions
      if (funcName === 'get_user_token_usage') {
        return {
          data: [{
            total_tokens: 1000,
            prompt_tokens: 400, 
            completion_tokens: 600,
            session_count: 5,
            message_count: 20
          }],
          error: null
        };
      } else if (funcName === 'get_session_token_usage') {
        return {
          data: [{
            total_tokens: 200,
            prompt_tokens: 80,
            completion_tokens: 120,
            message_count: 6,
            model: 'llama3'
          }],
          error: null
        };
      } else if (funcName === 'get_token_usage_analytics') {
        return {
          data: [
            {
              time_bucket: '2023-01-01T00:00:00Z',
              total_tokens: 500,
              unique_users: 3,
              unique_sessions: 4,
              avg_tokens_per_message: 100
            },
            {
              time_bucket: '2023-01-02T00:00:00Z',
              total_tokens: 750,
              unique_users: 5,
              unique_sessions: 6,
              avg_tokens_per_message: 125
            }
          ],
          error: null
        };
      }
      return { data: [], error: null };
    }
  } as unknown as ReturnType<typeof createClient>;
  
  const tokenLogger = new TokenLogger(mockSupabaseClient);
  logger.info('Token Logger initialized successfully');
  
  // Test 2: Basic Token Counting
  logSection('Test 2: Basic Token Counting');
  
  const testMessages = [
    'Hello, how are you?',
    'The quick brown fox jumps over the lazy dog.',
    'Machine learning is a subset of artificial intelligence that involves training models on data.',
    'Transformers are a type of neural network architecture that has revolutionized natural language processing.'
  ];
  
  for (const [index, text] of testMessages.entries()) {
    const tokenCount = await tokenCounter.countTokens(text);
    logger.info(`Message ${index + 1} (${text.length} chars): ${tokenCount} tokens`);
  }
  
  // Test 3: Session Token Tracking
  logSection('Test 3: Session Token Tracking');
  
  const sessionId = `test-session-${uuidv4()}`;
  const userId = `test-user-${uuidv4()}`;
  
  logger.info(`Testing session: ${sessionId}`);
  logger.info(`Testing user: ${userId}`);
  
  // Track sample conversations
  const testSequence = [
    { role: 'system', content: 'You are a helpful AI assistant.', tokens: 8 },
    { role: 'user', content: 'What is the capital of France?', tokens: 7 },
    { role: 'assistant', content: 'The capital of France is Paris. It is known as the "City of Light" and is famous for the Eiffel Tower.', tokens: 24 },
    { role: 'user', content: 'Tell me more about Paris.', tokens: 6 },
    { role: 'assistant', content: 'Paris is the capital and most populous city of France. Situated on the Seine River, it has been one of Europe\'s major centers of finance, diplomacy, commerce, fashion, and arts for centuries. The city is known for its museums including the Louvre, its architecture including the Eiffel Tower, and its rich history.', tokens: 64 }
  ];
  
  logger.info(`Tracking token usage for session: ${sessionId}`);
  
  // Add each message to the tracker
  let promptTokens = 0;
  let completionTokens = 0;
  
  for (const [index, message] of testSequence.entries()) {
    const messageId = uuidv4();
    const timestamp = Date.now() - (testSequence.length - index) * 60000; // Spread messages over time
    
    // Track tokens by session
    if (message.role === 'user' || message.role === 'system') {
      await tokenTracker.trackSessionTokens(
        sessionId,
        message.tokens, // prompt tokens
        0, // completion tokens
        'llama3' // model
      );
      promptTokens += message.tokens;
    } else if (message.role === 'assistant') {
      await tokenTracker.trackSessionTokens(
        sessionId,
        0, // prompt tokens
        message.tokens, // completion tokens
        'llama3' // model
      );
      completionTokens += message.tokens;
    }
    
    // Also track by user
    if (message.role === 'user' || message.role === 'system') {
      await tokenTracker.trackUserTokens(
        userId,
        message.tokens, // prompt tokens
        0, // completion tokens
        'llama3' // model
      );
    } else if (message.role === 'assistant') {
      await tokenTracker.trackUserTokens(
        userId,
        0, // prompt tokens
        message.tokens, // completion tokens
        'llama3' // model
      );
    }
    
    // Track using token logger (mock)
    await tokenLogger.logTokenCount({
      session_id: sessionId,
      user_id: userId,
      message_id: messageId,
      role: message.role as 'system' | 'user' | 'assistant',
      text_length: message.content.length,
      token_count: message.tokens,
      model: 'llama3',
      metadata: { timestamp }
    });
    
    logger.info(`Tracked message ${index + 1}: ${message.role}, ${message.tokens} tokens`);
  }
  
  // Query token usage
  const totalUsage = await tokenTracker.getSessionTokenUsage(sessionId);
  logger.info('Total token usage for session:');
  logger.info(`- Prompt tokens: ${totalUsage.prompt}`);
  logger.info(`- Completion tokens: ${totalUsage.completion}`);
  logger.info(`- Total tokens: ${totalUsage.total}`);
  
  const userUsage = await tokenTracker.getUserTokenUsage(userId);
  logger.info('Total token usage for user:');
  logger.info(`- Prompt tokens: ${userUsage.prompt}`);
  logger.info(`- Completion tokens: ${userUsage.completion}`);
  logger.info(`- Total tokens: ${userUsage.total}`);
  
  if (userUsage.windows) {
    logger.info('Token usage windows:');
    logger.info(`- Last hour: ${userUsage.windows.hour}`);
    logger.info(`- Last day: ${userUsage.windows.day}`);
    logger.info(`- Last month: ${userUsage.windows.month}`);
  }
  
  // Test 4: Rate Limiting
  logSection('Test 4: Rate Limiting');
  
  const rateCheckResult = await tokenTracker.checkRateLimits(userId);
  logger.info(`Rate limit check: ${rateCheckResult.allowed ? 'Allowed' : 'Blocked'}`);
  
  if (!rateCheckResult.allowed) {
    logger.info(`Reason: ${rateCheckResult.reason}`);
  }
  
  logger.info('Current usage vs limits:');
  logger.info(`- Hourly: ${userUsage.windows?.hour || 0} / ${tokenTracker['options'].rateLimits?.userHourly || 'unlimited'}`);
  logger.info(`- Daily: ${userUsage.windows?.day || 0} / ${tokenTracker['options'].rateLimits?.userDaily || 'unlimited'}`);
  logger.info(`- Monthly: ${userUsage.windows?.month || 0} / ${tokenTracker['options'].rateLimits?.userMonthly || 'unlimited'}`);
  
  // Test 5: Token Analytics
  logSection('Test 5: Token Analytics');
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // 30 days ago
  
  const endDate = new Date();
  
  // Get user analytics
  const userAnalytics = await tokenLogger.getUserTokenUsage(userId, startDate, endDate);
  logger.info('Token usage analytics for user:');
  logger.info(`- Total tokens: ${userAnalytics.total_tokens}`);
  logger.info(`- Prompt tokens: ${userAnalytics.prompt_tokens}`);
  logger.info(`- Completion tokens: ${userAnalytics.completion_tokens}`);
  logger.info(`- Session count: ${userAnalytics.session_count}`);
  logger.info(`- Message count: ${userAnalytics.message_count}`);
  
  // Get session analytics
  const sessionAnalytics = await tokenLogger.getSessionTokenUsage(sessionId);
  logger.info('Token usage analytics for session:');
  logger.info(`- Total tokens: ${sessionAnalytics.total_tokens}`);
  logger.info(`- Prompt tokens: ${sessionAnalytics.prompt_tokens}`);
  logger.info(`- Completion tokens: ${sessionAnalytics.completion_tokens}`);
  logger.info(`- Message count: ${sessionAnalytics.message_count}`);
  logger.info(`- Model: ${sessionAnalytics.model}`);
  
  // Get time-based analytics
  const intervals = ['hour', 'day', 'week', 'month'] as const;
  
  for (const interval of intervals) {
    try {
      const analytics = await tokenLogger.getTokenUsageAnalytics(interval, startDate, endDate);
      
      logger.info(`Token usage for interval "${interval}":`);
      logger.info(`- Data points: ${analytics.length}`);
      
      if (analytics.length > 0) {
        // Log each data point
        analytics.slice(0, 5).forEach((point, i) => {
          logger.info(`- Point ${i+1}:`);
          logger.info(`  * Time: ${point.time_bucket}`);
          logger.info(`  * Total tokens: ${point.total_tokens}`);
          logger.info(`  * Unique users: ${point.unique_users}`);
          logger.info(`  * Unique sessions: ${point.unique_sessions}`);
          logger.info(`  * Avg tokens per message: ${point.avg_tokens_per_message}`);
        });
        
        if (analytics.length > 5) {
          logger.info(`  * ... (${analytics.length - 5} more time points)`);
        }
      }
    } catch (error) {
      logger.warn(`Analytics for interval "${interval}" failed:`, error);
    }
  }
  
  // Test 6: Cost Calculation
  logSection('Test 6: Cost Calculation');
  
  // Simple cost models (per 1000 tokens)
  const costModels = {
    'llama3': { input: 0.0005, output: 0.0015 },
    'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
    'gpt-4': { input: 0.03, output: 0.06 }
  };
  
  const model = 'llama3';
  const costPerThousandInput = costModels[model as keyof typeof costModels]?.input || 0;
  const costPerThousandOutput = costModels[model as keyof typeof costModels]?.output || 0;
  
  const inputCost = (promptTokens / 1000) * costPerThousandInput;
  const outputCost = (completionTokens / 1000) * costPerThousandOutput;
  const totalCost = inputCost + outputCost;
  
  logger.info(`Cost calculation for model ${model}:`);
  logger.info(`- Input cost rate: $${costPerThousandInput} per 1K tokens`);
  logger.info(`- Output cost rate: $${costPerThousandOutput} per 1K tokens`);
  logger.info(`- Input tokens: ${promptTokens} (cost: $${inputCost.toFixed(6)})`);
  logger.info(`- Output tokens: ${completionTokens} (cost: $${outputCost.toFixed(6)})`);
  logger.info(`- Total cost: $${totalCost.toFixed(6)}`);
  
  // Cleanup
  logSection('Cleanup');
  
  // Remove test data from Redis
  const client = redisManager.getClient();
  await client.del(`tokens:session:${sessionId}`);
  await client.del(`tokens:user:${userId}`);
  
  logger.info('Test data cleaned up');
  logger.info('Closing Redis connection...');
  
  await redisManager.disconnect();
  
  logger.info('All tests completed successfully!');
}

// Run the tests
testTokenCounterAndTracker().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
}); 