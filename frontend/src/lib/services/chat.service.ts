import { ChatAPI } from '../api/chat/chat.api';
import { ChatConfig, ChatResponse, Message, StreamChunk } from '../types/chat';
import { store } from '../store';
import { addMessage, setIsGenerating, updateMessage } from '../store/slices/chatSlice';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from '../core/events';
import { ConfigService } from '../core/config';

interface ChatServiceDependencies {
  api: ChatAPI;
  events: EventEmitter;
  config: ConfigService;
}

class ChatService {
  private api: ChatAPI | null = null;
  private events: EventEmitter | null = null;
  private config: ConfigService | null = null;
  private currentStreamingMessageId: string | null = null;

  initialize(dependencies: ChatServiceDependencies) {
    this.api = dependencies.api;
    this.events = dependencies.events;
    this.config = dependencies.config;

    // Set up event listeners
    this.events.on('message:chunk', this.handleMessageChunk.bind(this));
    this.events.on('message:error', this.handleError.bind(this));
  }

  private handleMessageChunk(chunk: StreamChunk) {
    switch (chunk.type) {
      case 'metadata':
        // Handle metadata (session info, model info)
        this.currentStreamingMessageId = chunk.messageId || null;
        break;
      
      case 'content':
        if (chunk.content) {
          if (this.currentStreamingMessageId) {
            // Update existing streaming message
            store.dispatch(updateMessage({
              id: this.currentStreamingMessageId,
              content: chunk.content,
              is_streaming: true,
              metadata: {
                streamProgress: {
                  tokensReceived: chunk.content.length,
                  status: 'streaming'
                }
              }
            }));
          } else {
            // Create new streaming message
            const message: Message = {
              id: chunk.messageId || uuidv4(),
              content: chunk.content,
              role: 'assistant',
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              sessionId: store.getState().chat.currentSessionId!,
              is_streaming: true,
              metadata: {
                streamProgress: {
                  tokensReceived: chunk.content.length,
                  status: 'streaming'
                }
              }
            };
            store.dispatch(addMessage(message));
            this.currentStreamingMessageId = message.id;
          }
        }
        break;
      
      case 'done':
        if (this.currentStreamingMessageId) {
          // Mark message as complete
          store.dispatch(updateMessage({
            id: this.currentStreamingMessageId,
            is_streaming: false,
            metadata: {
              streamProgress: {
                tokensReceived: 0,
                status: 'complete'
              }
            }
          }));
          this.currentStreamingMessageId = null;
        }
        store.dispatch(setIsGenerating(false));
        this.events?.emit('message:complete');
        break;
      
      case 'error':
        if (this.currentStreamingMessageId) {
          // Mark message as error
          store.dispatch(updateMessage({
            id: this.currentStreamingMessageId,
            is_streaming: false,
            is_error: true,
            metadata: {
              streamProgress: {
                tokensReceived: 0,
                status: 'error'
              }
            }
          }));
          this.currentStreamingMessageId = null;
        }
        this.handleError(chunk.data.error || 'An unknown error occurred');
        break;
    }

    // Handle tool results if present
    if (chunk.data.toolResults) {
      const message: Message = {
        id: chunk.messageId || uuidv4(),
        content: chunk.data.toolResults.response || '',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        sessionId: store.getState().chat.currentSessionId!,
        metadata: {
          toolResults: chunk.data.toolResults
        }
      };
      store.dispatch(addMessage(message));
    }
  }

  private handleError(error: string) {
    const errorMessage: Message = {
      id: uuidv4(),
      content: error,
      role: 'assistant',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      sessionId: store.getState().chat.currentSessionId!,
      is_error: true,
    };
    store.dispatch(addMessage(errorMessage));
    store.dispatch(setIsGenerating(false));
  }

  async sendMessage(content: string): Promise<void> {
    if (!this.api || !this.events || !this.config) {
      throw new Error('ChatService not initialized');
    }

    try {
      // Add user message immediately
      const userMessage: Message = {
        id: uuidv4(),
        content,
        role: 'user',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        sessionId: store.getState().chat.currentSessionId!,
      };
      store.dispatch(addMessage(userMessage));
      store.dispatch(setIsGenerating(true));
      this.events.emit('message:start');

      const chatConfig = this.config.getChatConfig();
      
      // Use streaming by default
      const stream = await this.api.streamMessage({
        content,
        sessionId: store.getState().chat.currentSessionId!,
        modelId: store.getState().chat.currentModel,
        config: chatConfig
      });

      // Create initial streaming message
      const messageId = uuidv4();
      store.dispatch(addMessage({
        id: messageId,
        content: '',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        sessionId: store.getState().chat.currentSessionId!,
        is_streaming: true
      }));

      // Process stream
      for await (const chunk of stream) {
        this.handleMessageChunk(chunk);
      }
    } catch (error) {
      this.handleError('Sorry, there was an error processing your message. Please try again.');
    } finally {
      store.dispatch(setIsGenerating(false));
    }
  }

  async regenerateMessage(messageId: string): Promise<void> {
    if (!this.api || !this.config) {
      throw new Error('ChatService not initialized');
    }

    try {
      store.dispatch(setIsGenerating(true));
      const chatConfig = this.config.getChatConfig();
      const response = await this.api.regenerateMessage(messageId, chatConfig);
      store.dispatch(addMessage(response.message));
    } catch (error) {
      this.handleError('Sorry, there was an error regenerating the message. Please try again.');
    } finally {
      store.dispatch(setIsGenerating(false));
    }
  }

  async stopGeneration(): Promise<void> {
    if (!this.api) {
      throw new Error('ChatService not initialized');
    }

    try {
      await this.api.stopGeneration();
      this.events?.emit('generation:stop');
    } catch (error) {
      console.error('Error stopping generation:', error);
    } finally {
      store.dispatch(setIsGenerating(false));
    }
  }

  async loadHistory(sessionId: string): Promise<void> {
    if (!this.api) {
      throw new Error('ChatService not initialized');
    }

    try {
      const messages = await this.api.getHistory(sessionId);
      messages.forEach(message => {
        store.dispatch(addMessage(message));
      });
    } catch (error) {
      console.error('Error loading chat history:', error);
      this.handleError('Failed to load chat history');
    }
  }
}

// Export singleton instance
export const chatService = new ChatService(); 