
import { io, Socket } from 'socket.io-client';
import { store } from '../redux/store';
import { addMessage, setStreamingFlag, setIsGenerating } from '../redux/features/chatSlice';
import { v4 as uuidv4 } from 'uuid';

class WebSocketManager {
  private socket: Socket | null = null;
  private messageQueue: { id: string; content: string }[] = [];
  private activeMessageId: string | null = null;
  private streamingInterval: NodeJS.Timeout | null = null;

  // Establish WebSocket connection
  connect(url: string): void {
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
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
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

  // Send a message to the websocket server
  sendMessage(content: string, modelId: string): string {
    if (!this.socket) {
      console.error('WebSocket not connected');
      return '';
    }

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
    }

    this.stopStreaming();
  }
}

export default new WebSocketManager();
