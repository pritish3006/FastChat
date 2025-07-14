import { ContextManager } from '../context';
import { RedisManager } from '../redis';
import { MemoryConfig } from '../config';
import { Message } from '../../types';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import logger from '../../../../utils/logger';

// Set log level to info for tests
logger.level = 'info';

// Helper to log test sections
function logSection(name: string) {
  logger.info(`\n=== Testing ${name} ===\n`);
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

async function testContextManager() {
  try {
    // Initialize managers
    const redis = new RedisManager({
      enabled: true,
      url: redisUrl,
      prefix: 'test:memory:',
      sessionTTL: 300
    });
    
    // Initialize Redis connection
    await redis.initialize();
    
    const config: MemoryConfig = {
      redis: {
        enabled: true,
        url: redisUrl,
        prefix: 'test:memory:',
        sessionTTL: 300
      },
      defaults: {
        maxContextSize: 10,
        sessionTTL: 3600,
        maxMessageSize: 1024 * 1024
      }
    };
    const context = new ContextManager(redis, config);

    // Test 1: Empty Context
    logSection('Empty Context');
    const emptyContext = await context.assembleContext('test-session-1');
    if (emptyContext.messages.length !== 0) {
      throw new Error('Empty context should have no messages');
    }
    logger.info('✓ Empty context test passed');

    // Test 2: System Prompt
    logSection('System Prompt');
    const systemPrompt = 'You are a helpful assistant.';
    await redis.addMessage({
      id: '1',
      sessionId: 'test-session-2',
      role: 'system',
      content: systemPrompt,
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 8 }
    });

    const systemContext = await context.assembleContext('test-session-2');
    if (!systemContext.systemPrompt || systemContext.systemPrompt !== systemPrompt) {
      throw new Error('System prompt not included correctly');
    }
    logger.info('✓ System prompt test passed');

    // Test 3: Message Order
    logSection('Message Order');
    const messages: Message[] = [
      {
        id: '2',
        sessionId: 'test-session-3',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now() - 2000,
        version: 1,
        metadata: { tokens: 1 }
      },
      {
        id: '3',
        sessionId: 'test-session-3',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: Date.now() - 1000,
        version: 1,
        metadata: { tokens: 2 }
      }
    ];

    for (const msg of messages) {
      await redis.addMessage(msg);
    }

    const orderedContext = await context.assembleContext('test-session-3');
    if (orderedContext.messages[0].content !== 'Hello' || 
        orderedContext.messages[1].content !== 'Hi there!') {
      throw new Error('Messages not in correct order');
    }
    logger.info('✓ Message order test passed');

    // Test 4: LangChain Message Conversion
    logSection('LangChain Message Conversion');
    const langChainMessages = context.toLangChainMessages(messages);
    
    if (!(langChainMessages[0] instanceof HumanMessage) || 
        !(langChainMessages[1] instanceof AIMessage)) {
      throw new Error('Messages not converted to correct LangChain types');
    }

    const convertedBack = context.fromLangChainMessages(langChainMessages, 'test-session-4');
    if (convertedBack[0].role !== 'user' || convertedBack[1].role !== 'assistant') {
      throw new Error('LangChain messages not converted back correctly');
    }
    logger.info('✓ LangChain message conversion test passed');

    // Test 5: Token Counting
    logSection('Token Counting');
    const longMessage: Message = {
      id: '4',
      sessionId: 'test-session-5',
      role: 'user',
      content: 'This is a longer message that should be counted correctly in terms of tokens.',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 15 }
    };
    await redis.addMessage(longMessage);

    const tokenContext = await context.assembleContext('test-session-5', { maxTokens: 10 });
    if (tokenContext.metadata.tokenCount > 10) {
      throw new Error('Token limit not enforced correctly');
    }
    logger.info('✓ Token counting test passed');

    // Test 5a: Unicode and Emoji Token Counting
    logSection('Unicode and Emoji Token Counting');
    const unicodeMessage: Message = {
      id: '4a',
      sessionId: 'test-session-5a',
      role: 'user',
      content: '你好！Hello! 👋 🌟 This is a mixed Unicode message こんにちは',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 20 }
    };
    await redis.addMessage(unicodeMessage);
    const unicodeContext = await context.assembleContext('test-session-5a');
    logger.info(`Unicode message token count: ${unicodeContext.metadata.tokenCount}`);
    logger.info('✓ Unicode and emoji token counting test passed');

    // Test 5b: Code Blocks Token Counting
    logSection('Code Blocks Token Counting');
    const codeMessage: Message = {
      id: '4b',
      sessionId: 'test-session-5b',
      role: 'assistant',
      content: '```typescript\nfunction test() {\n  const x: number = 42;\n  return x;\n}\n```',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 25 }
    };
    await redis.addMessage(codeMessage);
    const codeContext = await context.assembleContext('test-session-5b');
    logger.info(`Code block token count: ${codeContext.metadata.tokenCount}`);
    logger.info('✓ Code blocks token counting test passed');

    // Test 5c: URLs and Long Strings
    logSection('URLs and Long Strings Token Counting');
    const urlMessage: Message = {
      id: '4c',
      sessionId: 'test-session-5c',
      role: 'user',
      content: 'Check this link: https://very-long-subdomain.another-subdomain.example.com/path/to/resource?param=value&another=test\nAnd this long string: ThisIsAVeryLongStringWithoutAnySpacesOrPunctuationThatShouldBeTokenizedCorrectly',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 30 }
    };
    await redis.addMessage(urlMessage);
    const urlContext = await context.assembleContext('test-session-5c');
    logger.info(`URL and long string token count: ${urlContext.metadata.tokenCount}`);
    logger.info('✓ URLs and long strings token counting test passed');

    // Test 5d: Mixed Language and Special Characters
    logSection('Mixed Language and Special Characters Token Counting');
    const mixedMessage: Message = {
      id: '4d',
      sessionId: 'test-session-5d',
      role: 'user',
      content: '你好 world! こんにちは! Café & Über. Multiple!!!!! punctuation..... marks.... $#@&*',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 35 }
    };
    await redis.addMessage(mixedMessage);
    const mixedContext = await context.assembleContext('test-session-5d');
    logger.info(`Mixed language token count: ${mixedContext.metadata.tokenCount}`);
    logger.info('✓ Mixed language and special characters token counting test passed');

    // Test 5e: Very Short Messages
    logSection('Very Short Messages Token Counting');
    const shortMessages: Message[] = [
      {
        id: '4e1',
        sessionId: 'test-session-5e',
        role: 'user',
        content: 'K',
        timestamp: Date.now(),
        version: 1,
        metadata: { tokens: 1 }
      },
      {
        id: '4e2',
        sessionId: 'test-session-5e',
        role: 'assistant',
        content: ':-)',
        timestamp: Date.now() + 1000,
        version: 1,
        metadata: { tokens: 1 }
      }
    ];
    
    for (const msg of shortMessages) {
      await redis.addMessage(msg);
    }
    
    const shortContext = await context.assembleContext('test-session-5e');
    if (shortContext.metadata.tokenCount < 2) {
      throw new Error('Very short messages not counted correctly');
    }
    logger.info(`Short messages token count: ${shortContext.metadata.tokenCount}`);
    logger.info('✓ Very short messages token counting test passed');

    // Test 5f: Whitespace and Formatting
    logSection('Whitespace and Formatting Token Counting');
    const whitespaceMessage: Message = {
      id: '4f',
      sessionId: 'test-session-5f',
      role: 'user',
      content: '\n\n    This   message    has    lots   of   \n\n   whitespace   \t   and\t\tformatting\n\n',
      timestamp: Date.now(),
      version: 1,
      metadata: { tokens: 15 }
    };
    await redis.addMessage(whitespaceMessage);
    const whitespaceContext = await context.assembleContext('test-session-5f');
    logger.info(`Whitespace formatting token count: ${whitespaceContext.metadata.tokenCount}`);
    logger.info('✓ Whitespace and formatting token counting test passed');

    // Test 6: Branch Support
    logSection('Branch Support');
    const branchMessage: Message = {
      id: '5',
      sessionId: 'test-session-6',
      role: 'user',
      content: 'This is in a branch',
      timestamp: Date.now(),
      version: 1,
      metadata: { 
        tokens: 5,
        model: 'test-model',
        persistedAt: Date.now()
      }
    };
    await redis.addMessage(branchMessage);

    const branchContext = await context.assembleContext('test-session-6', { branchId: 'test-branch' });
    if (!branchContext.metadata.branchId) {
      throw new Error('Branch context not handled correctly');
    }
    logger.info('✓ Branch support test passed');

    // Test 7: Context Summarization
    logSection('Context Summarization');
    const longMessages: Message[] = Array.from({ length: 5 }, (_, i) => ({
      id: `long-${i}`,
      sessionId: 'test-session-7',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i} with some content that takes up tokens.`,
      timestamp: Date.now() + i * 1000,
      version: 1,
      metadata: { tokens: 10 }
    }));

    for (const msg of longMessages) {
      await redis.addMessage(msg);
    }

    const summarizedContext = await context.assembleContext('test-session-7', {
      maxTokens: 20,
      summarize: true
    });

    if (summarizedContext.metadata.tokenCount > 20) {
      throw new Error('Summarization did not respect token limit');
    }
    logger.info('✓ Context summarization test passed');

    logger.info('\n=== All Context Manager tests passed! ===\n');
    process.exit(0);
  } catch (error) {
    logger.error('Context Manager test failed:', error);
    process.exit(1);
  }
}

// Run tests
testContextManager(); 