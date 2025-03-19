import { StreamingManager } from '../streaming';
import { LLMService } from '..';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../../utils/logger';

function parseLangChainResponse(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.kwargs?.content) {
      return parsed.kwargs.content;
    }
    return jsonStr;
  } catch (e) {
    return jsonStr;
  }
}

async function testStreamingManager() {
  console.log('🚀 Starting StreamingManager Test with Real Ollama...\n');
  
  // Initialize LLM Service
  console.log('Initializing LLM Service...');
  const llmService = new LLMService({
    model: {
      provider: 'ollama',
      modelId: 'llama3.2:latest',  // Using the model we confirmed is available
      baseUrl: 'http://localhost:11434'
    }
  });
  
  await llmService.initialize();
  console.log('LLM Service initialized');
  
  const streamingManager = new StreamingManager();
  const sessionId = uuidv4();
  const messageId = uuidv4();
  let accumulatedContent = '';
  let tokenCount = 0;
  let isComplete = false;
  let hasError = false;

  try {
    console.log('\nTesting stream with prompt...');
    const chatResponse = await llmService.chat({
      sessionId,
      message: "What is the capital of France? Keep it very short.",
      callbacks: {
        onToken: (token: string) => {
          tokenCount++;
          accumulatedContent += token;
          console.log(`Raw LLM Token (${tokenCount}):`, token);
        },
        onComplete: () => {
          isComplete = true;
          console.log('\nLLM Stream completed');
          const parsedContent = parseLangChainResponse(accumulatedContent);
          console.log('Final content:', parsedContent);
          console.log('Total tokens:', tokenCount);
        },
        onError: (error: Error) => {
          hasError = true;
          console.error('LLM Stream error:', error);
        }
      }
    });

    console.log('\nChat Response:', {
      ...chatResponse,
      text: parseLangChainResponse(chatResponse.text)
    });
    console.log('Active Streams:', streamingManager.getAllActiveStreams());

    // Test cancellation with a longer prompt
    console.log('\nTesting stream cancellation...');
    const newSessionId = uuidv4();
    const newMessageId = uuidv4();
    let cancelledContent = '';
    let isCancelled = false;

    const longChatResponse = await llmService.chat({
      sessionId: newSessionId,
      message: "Write a very long essay about the history of Paris. Include many details.",
      callbacks: {
        onToken: (token: string) => {
          if (!isCancelled) {
            cancelledContent += token;
            console.log('Token before cancel:', token);
          }
        },
        onComplete: () => {
          if (!isCancelled) {
            console.log('Stream completed (should not see this)');
          }
        },
        onError: (error: Error) => {
          if (!isCancelled) {
            console.error('Stream error:', error);
          }
        }
      }
    });

    // Wait for some tokens to be received
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('\nCancelling stream...');
    isCancelled = true;
    await streamingManager.cancelStream(longChatResponse.messageId);

    console.log('Content before cancellation:', parseLangChainResponse(cancelledContent));
    console.log('Stream status after cancel:', streamingManager.getStreamProgress(longChatResponse.messageId));

    // Final status
    console.log('\n✅ Test Summary:');
    console.log('Tokens received:', tokenCount);
    console.log('Stream completed:', isComplete);
    console.log('Had errors:', hasError);
    console.log('Cancellation tested:', true);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
console.log('Running StreamingManager test with real Ollama...');
testStreamingManager().catch(console.error); 