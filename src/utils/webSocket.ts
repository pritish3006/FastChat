import { io, Socket } from 'socket.io-client';
import { store } from '../redux/store';
import { addMessage, setStreamingFlag, setIsGenerating } from '../redux/features/chatSlice';
import { v4 as uuidv4 } from 'uuid';

class WebSocketManager {
  private socket: Socket | null = null;
  private messageQueue: { id: string; content: string }[] = [];
  private activeMessageId: string | null = null;
  private streamingInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private mockMode: boolean = true; // Enable mock mode for demo

  // Establish WebSocket connection
  connect(url: string): void {
    if (this.mockMode) {
      console.log('WebSocket in mock mode');
      this.isConnected = true;
      return;
    }

    this.socket = io(url, {
      transports: ['websocket'],
      withCredentials: true,
    });

    this.setupEventListeners();
  }

  // Set up WebSocket event listeners
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Handle incoming message chunks
    this.socket.on('message-chunk', (data: { id: string; content: string; done: boolean }) => {
      this.handleMessageChunk(data);
    });
  }

  // Handle streaming message chunks
  private handleMessageChunk(data: { id: string; content: string; done: boolean }): void {
    const { id, content, done } = data;

    // Find or add message to queue
    const existingMessage = this.messageQueue.find((msg) => msg.id === id);
    if (existingMessage) {
      existingMessage.content += content;
    } else {
      this.messageQueue.push({ id, content });
      // If this is a new message and we don't have an active message,
      // create the message in the store immediately
      if (!this.activeMessageId) {
        this.activeMessageId = id;
        store.dispatch(
          addMessage({
            content: content,
            role: 'assistant',
            chat_id: store.getState().chat.currentSessionId || '',
            is_streaming: true,
          })
        );
        store.dispatch(setStreamingFlag({ id, isStreaming: true }));
        this.startStreaming();
      }
    }

    // If message is complete, stop streaming
    if (done && id === this.activeMessageId) {
      this.stopStreaming();
      store.dispatch(setStreamingFlag({ id, isStreaming: false }));
      store.dispatch(setIsGenerating(false));
      this.activeMessageId = null;

      // Process next message in queue if any
      this.processNextMessage();
    }
  }

  // Start the streaming update interval
  private startStreaming(): void {
    if (this.streamingInterval) return;

    this.streamingInterval = setInterval(() => {
      if (!this.activeMessageId) return;

      const messageData = this.messageQueue.find((msg) => msg.id === this.activeMessageId);
      if (messageData) {
        store.dispatch({
          type: 'chat/updateMessage',
          payload: { id: this.activeMessageId, content: messageData.content },
        });
      }
    }, 100); // Update UI every 100ms
  }

  // Stop the streaming update interval
  private stopStreaming(): void {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
  }

  // Process the next message in the queue
  private processNextMessage(): void {
    if (this.messageQueue.length > 0 && !this.activeMessageId) {
      const nextMessage = this.messageQueue[0];
      this.activeMessageId = nextMessage.id;
      
      store.dispatch(
        addMessage({
          content: nextMessage.content,
          role: 'assistant',
          chat_id: store.getState().chat.currentSessionId || '',
          is_streaming: true,
        })
      );
      
      store.dispatch(setStreamingFlag({ id: nextMessage.id, isStreaming: true }));
      this.startStreaming();
    }
  }

  private mockResponse(content: string): void {
    setTimeout(() => {
      const messageId = uuidv4();
      
      store.dispatch(
        addMessage({
          content: this.generateMockResponse(content),
          role: 'assistant',
          chat_id: store.getState().chat.currentSessionId || '',
          is_streaming: true,
        })
      );
      
      store.dispatch(setStreamingFlag({ id: messageId, isStreaming: true }));
      
      // Simulate streaming completion
      setTimeout(() => {
        store.dispatch(setStreamingFlag({ id: messageId, isStreaming: false }));
        store.dispatch(setIsGenerating(false));
      }, 500);
      
    }, 800);
  }

  private generateMockResponse(content: string): string {
    // Simple response generator based on user input keywords
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('hello') || lowerContent.includes('hi')) {
      return "Hello! How can I assist you today?";
    } else if (lowerContent.includes('help')) {
      return "I'm here to help! What specific assistance do you need?";
    } else if (lowerContent.includes('code') || lowerContent.includes('function')) {
      return "Here's a simple JavaScript function:\n\n```javascript\nfunction example() {\n  console.log('Hello, world!');\n}\n```\n\nIs this what you were looking for?";
    } else if (lowerContent.includes('weather')) {
      return "I don't have real-time weather data, but I can suggest checking a weather app or website for the most current information.";
    } else {
      return "Thank you for your message. Is there anything specific you'd like to know more about?";
    }
  }

  // Send a message to the websocket server
  sendMessage(content: string, modelId: string): string {
    // Set generating state
    store.dispatch(setIsGenerating(true));

    // Generate a message ID
    const messageId = uuidv4();

    // Add user message to store
    store.dispatch(
      addMessage({
        content,
        role: 'user',
        chat_id: store.getState().chat.currentSessionId || '',
      })
    );

    if (this.mockMode) {
      // Use mock response in demo mode
      this.mockResponse(content);
      return messageId;
    }

    if (!this.socket || !this.isConnected) {
      console.error('WebSocket not connected, but still adding message to UI');
      store.dispatch(setIsGenerating(false));
      return messageId;
    }

    // Send message to server
    this.socket.emit('send-message', {
      id: messageId,
      content,
      modelId,
    });

    return messageId;
  }

  // Stop message generation
  stopGeneration(): void {
    if (this.mockMode) {
      store.dispatch(setIsGenerating(false));
      return;
    }

    if (!this.socket || !this.activeMessageId) return;

    this.socket.emit('stop-generation', {
      id: this.activeMessageId,
    });

    this.stopStreaming();
    store.dispatch(setIsGenerating(false));
    
    if (this.activeMessageId) {
      store.dispatch(setStreamingFlag({ id: this.activeMessageId, isStreaming: false }));
      this.activeMessageId = null;
    }
  }

  // Disconnect WebSocket
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }

    this.stopStreaming();
  }
}

export default new WebSocketManager();
