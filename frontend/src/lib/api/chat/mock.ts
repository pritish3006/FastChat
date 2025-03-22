import { v4 as uuidv4 } from 'uuid';
import {
  ChatMessage,
  ChatSession,
  SendMessageRequest,
  SendMessageResponse,
  ChatStreamChunk,
  ChatHistoryResponse,
} from './types';

// Mock chat session
const mockSession: ChatSession = {
  id: 'mock-session-1',
  messages: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  modelId: 'gpt-3.5-turbo',
};

// Helper to create a mock message
function createMockMessage(content: string, role: 'user' | 'assistant' = 'assistant'): ChatMessage {
  return {
    id: uuidv4(),
    content,
    role,
    timestamp: new Date().toISOString(),
    metadata: {
      modelId: 'gpt-3.5-turbo',
    },
  };
}

// Mock responses for different API calls
export const mockResponses = {
  sendMessage(request: SendMessageRequest): SendMessageResponse {
    const userMessage = createMockMessage(request.content, 'user');
    const assistantMessage = createMockMessage(`This is a mock response to: ${request.content}`);
    return {
      messages: [userMessage, assistantMessage]
    };
  },

  *streamMessage(request: SendMessageRequest): Generator<ChatStreamChunk> {
    const words = `This is a streaming mock response to: ${request.content}`.split(' ');
    const messageId = uuidv4();
    
    for (let i = 0; i < words.length; i++) {
      const isLast = i === words.length - 1;
      yield {
        content: words[i] + (isLast ? '' : ' '),
        messageId,
        sessionId: request.sessionId,
        done: isLast,
      };
    }
  },

  regenerateMessage(): ChatMessage {
    return createMockMessage('This is a regenerated mock response');
  },

  getHistory(): ChatMessage[] {
    return [
      createMockMessage('Hello!', 'user'),
      createMockMessage('Hi there! How can I help you today?'),
      createMockMessage('Can you help me with coding?', 'user'),
      createMockMessage('Of course! I\'d be happy to help with coding.'),
    ];
  },

  getSessions(): ChatSession[] {
    return [mockSession];
  },
}; 