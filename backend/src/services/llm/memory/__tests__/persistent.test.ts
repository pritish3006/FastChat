import assert from 'assert';
import { PersistentStore, PersistentStoreConfig } from '../persistent';
import { Message } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../../utils/logger';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Debug logging for environment setup
logger.info('Debug: Environment Setup');
logger.info('Current working directory:', process.cwd());

// Use backend/.env specifically
const backendEnvPath = path.resolve(process.cwd(), '.env');
logger.info('Loading environment variables from:', backendEnvPath);

if (!fs.existsSync(backendEnvPath)) {
  logger.error('Backend .env file not found at:', backendEnvPath);
  process.exit(1);
}

const envLoadResult = dotenv.config({ path: backendEnvPath, override: true });

if (envLoadResult.error) {
  logger.error('Error loading .env file:', envLoadResult.error);
  process.exit(1);
}

// Log environment status (safely)
logger.info('Environment variables after loading:');
const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value) {
    logger.error(`${varName} is not set after loading .env file`);
    process.exit(1);
  }
  logger.info(`${varName}: ${value.substring(0, 8)}...`);
});

// Set log level to info
logger.level = 'info';

// Helper function to log with formatting
function logSection(title: string): void {
  logger.info('\n' + '='.repeat(80));
  logger.info(` ${title} `);
  logger.info('='.repeat(80));
}

// Main test function
async function runTests() {
  let store: PersistentStore;
  let storeConfig: PersistentStoreConfig;

  // Initialize store
  logSection('Initializing Persistent Store');
  
  // Log environment variables (redacted for security)
  logger.info('Environment check:');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Required environment variables SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  }

  logger.info('SUPABASE_URL:', supabaseUrl.substring(0, 8) + '...');
  logger.info('SUPABASE_SERVICE_KEY:', '[REDACTED]');
  
  storeConfig = {
    supabaseUrl,
    supabaseKey
  };

  logger.info('Initializing store with config...');
  store = new PersistentStore(storeConfig);
  logger.info('Store instance created, calling initialize()...');
  await store.initialize();
  logger.info('✓ Store initialized successfully');

  // Clean up test data
  logSection('Cleaning Up Test Data');
  await store['supabase'].from('messages').delete().neq('id', '');
  await store['supabase'].from('token_logs').delete().neq('id', '');
  await store['supabase'].from('chat_sessions').delete().neq('id', '');
  logger.info('✓ Test data cleaned up');

  // Test message operations
  logSection('Testing Message Operations');
  
  // Test storing and retrieving message
  const testUserId = uuidv4();
  const testSessionId = uuidv4();
  const testMessage: Message = {
    id: uuidv4(),
    sessionId: testSessionId,
    role: 'user',
    content: 'Test message',
    timestamp: Date.now(),
    version: 1,
    metadata: { 
      tokens: 2,
      model: 'test-model',
      userId: testUserId,
      persistedAt: Date.now()
    }
  };

  // Create chat session first
  logger.info('Creating test session with data:', {
    id: testSessionId,
    userId: testUserId
  });

  const session = await store.getOrCreateSession(testSessionId, testUserId);
  assert(session, 'Session should be created');
  assert.strictEqual(session.id, testSessionId, 'Session ID should match');
  assert.strictEqual(session.userId, testUserId, 'User ID should match');

  // Verify session was created in database
  const { data: sessionData, error: sessionError } = await store['supabase']
    .from('chat_sessions')
    .select('*')
    .eq('id', testSessionId)
    .single();

  if (sessionError) {
    logger.error('Error verifying session:', sessionError);
    throw sessionError;
  }

  assert(sessionData, 'Session data should exist in database');
  assert.strictEqual(sessionData.id, testSessionId, 'Database session ID should match');
  assert.strictEqual(sessionData.user_id, testUserId, 'Database user ID should match');
  
  await store.storeMessage(testMessage);
  
  // Verify message and token log
  const stored = await store.getMessage(testMessage.id);
  assert(stored, 'Stored message should exist');
  assert.strictEqual(stored.content, testMessage.content, 'Message content should match');

  const { data: tokenLogs } = await store['supabase']
    .from('token_logs')
    .select('*')
    .eq('message_id', testMessage.id)
    .eq('session_id', testMessage.sessionId)
    .eq('user_id', testUserId);

  assert(tokenLogs, 'Token logs should exist');
  assert.strictEqual(tokenLogs.length, 1, 'Should have one token log entry');
  assert.strictEqual(tokenLogs[0].message_id, testMessage.id, 'Token log message ID should match');
  assert.strictEqual(tokenLogs[0].session_id, testMessage.sessionId, 'Token log session ID should match');
  assert.strictEqual(tokenLogs[0].user_id, testUserId, 'Token log user ID should match');
  assert.strictEqual(tokenLogs[0].role, testMessage.role, 'Token log role should match');
  assert.strictEqual(tokenLogs[0].text_length, testMessage.content.length, 'Token log text length should match');
  logger.info('✓ Message storage and retrieval test passed');

  // Test updating message
  logSection('Testing Message Updates');
  const updatedMessage = {
    ...testMessage,
    content: 'Updated content',
    version: 2,
    metadata: {
      ...testMessage.metadata,
      edited: true
    }
  };

  await store.updateMessage(updatedMessage);
  const storedUpdated = await store.getMessage(testMessage.id);
  assert.strictEqual(storedUpdated?.content, 'Updated content', 'Updated content should match');
  assert.strictEqual(storedUpdated?.version, 2, 'Version should be updated');
  assert.strictEqual((storedUpdated?.metadata as any).edited, true, 'Edit flag should be set');
  logger.info('✓ Message update test passed');

  // Test chat session operations
  logSection('Testing Chat Session Operations');
  const sessionId = uuidv4();
  const userId = uuidv4();
  
  const newSession = await store.getOrCreateSession(sessionId, userId);
  assert(newSession, 'New session should be created');
  assert.strictEqual(newSession.id, sessionId, 'Session ID should match');

  // Add messages to session
  const sessionMessages = Array.from({ length: 3 }, () => ({
    id: uuidv4(),
    sessionId,
    role: 'user' as const,
    content: 'Test message',
    timestamp: Date.now(),
    version: 1,
    metadata: { tokens: 2 }
  }));

  for (const msg of sessionMessages) {
    await store.storeMessage(msg);
  }

  const messageCount = await store.getMessageCount(sessionId);
  assert.strictEqual(messageCount, 3, 'Message count should be 3');
  logger.info('✓ Chat session operations test passed');

  // Test branch support
  logSection('Testing Branch Support');
  const branchId = uuidv4();
  const branchSessionId = uuidv4();
  const branchUserId = uuidv4();

  await store.getOrCreateSession(branchSessionId, branchUserId);

  const branchMessages = [
    {
      id: uuidv4(),
      sessionId: branchSessionId,
      role: 'user' as const,
      content: 'Branch message 1',
      timestamp: Date.now(),
      version: 1,
      branchId,
      metadata: { tokens: 3 }
    },
    {
      id: uuidv4(),
      sessionId: branchSessionId,
      role: 'user' as const,
      content: 'Branch message 2',
      timestamp: Date.now() + 1,
      version: 1,
      branchId,
      metadata: { tokens: 3 }
    }
  ];

  for (const msg of branchMessages) {
    await store.storeMessage(msg);
  }

  const branchMessagesRetrieved = await store.getMessages(branchSessionId, branchId);
  assert.strictEqual(branchMessagesRetrieved.length, 2, 'Should have 2 branch messages');
  assert.strictEqual(branchMessagesRetrieved[0].content, 'Branch message 1', 'First branch message content should match');
  assert.strictEqual(branchMessagesRetrieved[1].content, 'Branch message 2', 'Second branch message content should match');
  logger.info('✓ Branch support test passed');

  // Test pagination
  logSection('Testing Pagination');
  const paginationSessionId = uuidv4();
  const paginationUserId = uuidv4();
  await store.getOrCreateSession(paginationSessionId, paginationUserId);

  // Create 5 messages
  const paginationMessages = Array.from({ length: 5 }, (_, i) => ({
    id: uuidv4(),
    sessionId: paginationSessionId,
    role: 'user' as const,
    content: `Message ${i + 1}`,
    timestamp: Date.now() + i,
    version: 1,
    metadata: { tokens: 2 }
  }));

  for (const msg of paginationMessages) {
    await store.storeMessage(msg);
  }

  // Test pagination
  const page1 = await store.getMessages(paginationSessionId, undefined, { limit: 2, offset: 0 });
  assert.strictEqual(page1.length, 2, 'First page should have 2 messages');
  assert.strictEqual(page1[0].content, 'Message 1', 'First message content should match');
  assert.strictEqual(page1[1].content, 'Message 2', 'Second message content should match');

  const page2 = await store.getMessages(paginationSessionId, undefined, { limit: 2, offset: 2 });
  assert.strictEqual(page2.length, 2, 'Second page should have 2 messages');
  assert.strictEqual(page2[0].content, 'Message 3', 'Third message content should match');
  assert.strictEqual(page2[1].content, 'Message 4', 'Fourth message content should match');
  logger.info('✓ Pagination test passed');

  logger.info('\n✅ All tests passed successfully!\n');
}

// Run the tests
runTests().catch(error => {
  logger.error('Test failed:', {
    error: error instanceof Error ? {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error as any)
    } : error
  });
  process.exit(1);
}); 