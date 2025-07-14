import { BaseAPIClient } from '../base';
import { APIConfig } from '../types';
import {
  ChatMessage,
  ChatSession,
  SendMessageRequest,
  SendMessageResponse,
  StreamChunk,
  StreamChunkData,
  RegenerateRequest,
  ChatHistoryRequest,
  ChatHistoryResponse,
} from './types';
import { mockResponses } from './mock';

// Flag to control mock mode
const USE_MOCKS = import.meta.env?.VITE_ENABLE_MOCK_API === 'true';

// API version prefix
const API_PREFIX = 'api/v1';

export class ChatAPI extends BaseAPIClient {
  constructor(config: APIConfig) {
    super(config);
  }

  /**
   * Send a message to either chat or agent endpoint
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockResponses.sendMessage(request);
    }

    const endpoint = request.config.endpoint === 'agent' ? 'agent' : 'chat';
    const response = await this.post<{ success: boolean; messages: ChatMessage[] }>(
      `${API_PREFIX}/${endpoint}/message`,
      {
        message: request.content,
        session_id: request.sessionId,
        config: {
          model: request.config.modelId,
          temperature: request.config.temperature,
          max_tokens: request.config.maxTokens,
          use_voice: request.config.useVoice,
          tools: request.config.tools
        }
      }
    );

    return {
      messages: response.messages
    };
  }

  /**
   * Stream a chat message response using Server-Sent Events (SSE)
   */
  async *streamMessage(request: SendMessageRequest): AsyncGenerator<StreamChunk> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      yield* mockResponses.streamMessage(request);
      return;
    }

    const endpoint = request.config.endpoint === 'agent' ? 'agent' : 'chat';
    const url = `${this.config.baseUrl}/${API_PREFIX}/${endpoint}/message`;
    
    // Log the request details
    console.log('Streaming message request:', {
      url,
      method: 'POST',
      body: {
        message: request.content,
        session_id: request.sessionId,
        model: request.config.modelId,
        options: {
          temperature: request.config.temperature,
          max_tokens: request.config.maxTokens,
          system_prompt: request.config.systemPrompt
        }
      }
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: request.content,
        session_id: request.sessionId,
        model: request.config.modelId,
        options: {
          temperature: request.config.temperature,
          max_tokens: request.config.maxTokens,
          system_prompt: request.config.systemPrompt
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Failed to stream message: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Stream not available');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += new TextDecoder().decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield {
              type: data.type,
              content: data.content || '',
              messageId: data.message_id,
              sessionId: request.sessionId,
              data: {
                type: data.type,
                content: data.content,
                messageId: data.message_id,
                error: data.error,
                toolResults: data.tool_results
              }
            };
          } catch (error) {
            console.error('Error parsing SSE data:', error);
            continue;
          }
        }
      }
    }
  }

  /**
   * Get chat history for a session
   */
  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockResponses.getHistory();
    }

    const response = await this.get<{ success: boolean; messages: ChatMessage[] }>(
      `${API_PREFIX}/chat/history/${sessionId}`
    );

    return response.messages;
  }

  /**
   * Regenerate a message
   */
  async regenerateMessage(messageId: string, sessionId: string): Promise<ChatMessage> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockResponses.regenerateMessage();
    }

    const response = await this.post<{ success: boolean; message: ChatMessage }>(
      `${API_PREFIX}/chat/messages/${messageId}/regenerate`,
      { sessionId }
    );

    return response.message;
  }

  /**
   * Get all chat sessions
   */
  async getSessions(): Promise<ChatSession[]> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockResponses.getSessions();
    }

    return this.get<ChatSession[]>(`${API_PREFIX}/chat/sessions`);
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return;
    }

    await this.delete(`${API_PREFIX}/chat/sessions/${sessionId}`);
  }

  /**
   * Clear all messages in a session
   */
  async clearSession(sessionId: string): Promise<void> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return;
    }

    await this.post(`${API_PREFIX}/chat/sessions/${sessionId}/clear`);
  }

  /**
   * Stop message generation
   */
  async stopGeneration(sessionId: string): Promise<void> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    }

    await this.post(`${API_PREFIX}/chat/stop`, { sessionId });
  }
}

// Create and export a singleton instance with default config
export const chatAPI = new ChatAPI({
  baseUrl: import.meta.env?.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryAttempts: 3,
}); 