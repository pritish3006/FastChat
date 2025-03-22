import { ChatConfig, ChatResponse, Message, StreamChunk } from '../types/chat';

/**
 * Custom error class for API-related errors
 */
export class ChatAPIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ChatAPIError';
  }
}

/**
 * Handles all chat-related API communications
 */
export class ChatAPI {
  private baseUrl: string;
  private controller: AbortController | null = null;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  }

  /**
   * Sends a chat message and returns the response
   */
  async sendMessage(message: string, config: ChatConfig): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          config,
        }),
      });

      if (!response.ok) {
        throw new ChatAPIError('Failed to send message', response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ChatAPIError) throw error;
      throw new ChatAPIError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Streams a chat message response
   */
  async *streamMessage(message: string, config: ChatConfig): AsyncGenerator<StreamChunk> {
    this.controller = new AbortController();

    try {
      const response = await fetch(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          config,
        }),
        signal: this.controller.signal,
      });

      if (!response.ok) {
        throw new ChatAPIError('Failed to stream message', response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new ChatAPIError('Stream not available');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            yield data as StreamChunk;
          }
        }
      }
    } catch (error) {
      if (error instanceof ChatAPIError) throw error;
      throw new ChatAPIError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Fetches chat history for a session
   */
  async getHistory(sessionId: string): Promise<Message[]> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/history/${sessionId}`);
      
      if (!response.ok) {
        throw new ChatAPIError('Failed to fetch chat history', response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ChatAPIError) throw error;
      throw new ChatAPIError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Regenerates a specific message
   */
  async regenerateMessage(messageId: string, config: ChatConfig): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          config,
        }),
      });

      if (!response.ok) {
        throw new ChatAPIError('Failed to regenerate message', response.status);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ChatAPIError) throw error;
      throw new ChatAPIError(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Stops ongoing message generation
   */
  async stopGeneration(): Promise<void> {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}

// Export a singleton instance
export const chatAPI = new ChatAPI(); 