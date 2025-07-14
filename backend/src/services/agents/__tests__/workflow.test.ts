import { strict as assert } from 'assert';
import { WorkflowFactory } from '../graph/workflow-factory';
import { config } from '../../../config';
import { AgentContext } from '../base/types';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Simple test runner
async function runTests() {
  const tests: { name: string; fn: () => Promise<void> }[] = [];
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => Promise<void>) {
    tests.push({ name, fn });
  }

  // Helper to create initial context
  function createContext(message: string, history: ChatCompletionMessageParam[] = []): AgentContext {
    return {
      message,
      history,
      intermediateSteps: [],
      toolResults: {
        queryAnalysis: {
          needsSearch: false,
          needsVoice: false
        },
        search: [],
        voice: {}
      },
      config: {
        apiKey: config.llm.apiKey!,
        searchApiKey: config.search.tavilyApiKey!,
        voiceApiKey: config.voice.ttsApiKey!
      }
    };
  }

  // Helper to collect streaming output
  function createStreamingHandlers() {
    const output: string[] = [];
    const tools: { start: string[]; end: string[] } = {
      start: [],
      end: []
    };

    return {
      streaming: {
        onToken: (token: string) => output.push(token),
        onToolStart: (tool: string) => tools.start.push(tool),
        onToolEnd: (tool: string) => tools.end.push(tool)
      },
      output,
      tools
    };
  }

  // Basic Conversation Tests
  test('should handle a simple greeting', async () => {
    const { streaming, output } = createStreamingHandlers();
    const context = createContext('Hello! How are you today?');
    
    const workflow = WorkflowFactory.createChatWorkflow(context, streaming);
    const result = await workflow.execute('query');

    assert.ok(output.length > 0, 'Expected output to have content');
    assert.equal(result.context.toolResults.queryAnalysis?.needsSearch, false);
    assert.equal(result.context.toolResults.queryAnalysis?.needsVoice, false);
  });

  test('should maintain conversation context', async () => {
    const { streaming, output } = createStreamingHandlers();
    const history: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Hi there!' },
      { role: 'assistant', content: 'Hello! How can I help you today?' }
    ];
    
    const context = createContext('What did I just say to you?', history);
    
    const workflow = WorkflowFactory.createChatWorkflow(context, streaming);
    const result = await workflow.execute('query');

    assert.ok(output.length > 0, 'Expected output to have content');
    assert.ok(output.join('').includes('Hi there'), 'Expected response to reference previous message');
  });

  // Search Query Tests
  test('should handle a search query', async () => {
    const { streaming, output, tools } = createStreamingHandlers();
    const context = createContext('What are the latest developments in quantum computing?');
    
    const workflow = WorkflowFactory.createChatWorkflow(context, streaming);
    const result = await workflow.execute('query');

    assert.ok(tools.start.includes('search'), 'Expected search tool to be started');
    assert.ok(tools.end.includes('search'), 'Expected search tool to be completed');
    assert.ok(result.context.toolResults.search?.length > 0, 'Expected search results');
    assert.ok(output.length > 0, 'Expected output to have content');
  });

  // Complex Conversation Tests
  test('should handle multi-turn conversation with search', async () => {
    const { streaming, output, tools } = createStreamingHandlers();
    const history: ChatCompletionMessageParam[] = [
      { role: 'user', content: 'Tell me about quantum computing.' },
      { role: 'assistant', content: 'Quantum computing is a type of computing that uses quantum phenomena like superposition and entanglement...' }
    ];
    
    const context = createContext('What are some recent breakthroughs in this field?', history);
    
    const workflow = WorkflowFactory.createChatWorkflow(context, streaming);
    const result = await workflow.execute('query');

    assert.ok(tools.start.includes('search'), 'Expected search tool to be started');
    assert.ok(tools.end.includes('search'), 'Expected search tool to be completed');
    assert.ok(result.context.toolResults.search?.length > 0, 'Expected search results');
    assert.ok(output.length > 0, 'Expected output to have content');
    assert.equal(result.context.toolResults.queryAnalysis?.needsSearch, true);
  });

  // Run all tests
  console.log('Running workflow tests...\n');
  
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
}); 