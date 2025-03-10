/**
 * websocket manager module
 * 
 * this module handles real-time communication between the client and server using websocket.
 * it manages message streaming, queuing, and mock responses for development.
 * 
 * @module websocketmanager
 */

import { io, Socket } from 'socket.io-client';
import { store } from '../redux/store';
import { addMessage, setStreamingFlag, setIsGenerating, updateMessage } from '../redux/features/chatSlice';
import { v4 as uuidv4 } from 'uuid';

interface MessageQueueItem {
  id: string;
  content: string;
}

interface MessageChunkData {
  id: string;
  content: string;
  done: boolean;
}

/**
 * websocketmanager class handles all websocket operations and message management
 */
class WebSocketManager {
  private socket: Socket | null = null;
  private messageQueue: MessageQueueItem[] = []; // queue of messages to be processed - using defined MessageQueueItem interface
  private isConnecting = false; // flag to prevent multiple concurrent connections and for consistently connection state
  private activeMessageId: string | null = null;
  private reconnnectingAttempts = 0; // number of times the connection has been attempted
  private maxReconnectAttempts = 5; // maximum number of reconnection attempts
  private reconnnectDelay = 1000; // delay in milliseconds before attempting a reconnection
  private streamingInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private mockMode: boolean = true; // enable mock mode for development/demo

  /**
   * establishes a websocket connection to the specified url
   * @param url - the websocket server url to connect to
   */
  connect(url: string): void { 
    if (this.mockMode) {
      console.log('websocket running in mock mode');
      this.isConnected = true;
      return;
    }

    this.socket = io(url, {
      transports: ['websocket'],
      withCredentials: true,
    });

    this.setupEventListeners();
  }

  /**
   * sets up websocket event listeners for connection management and message handling
   * @private
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('websocket connection established successfully');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('websocket connection terminated');
      this.isConnected = false;
    });

    this.socket.on('error', (error) => {
      console.error('websocket encountered an error:', error);
    });

    // handle incoming message chunks from the server
    this.socket.on('message-chunk', (data: MessageChunkData) => {
      this.handleMessageChunk(data);
    });
  }

  /**
   * processes incoming message chunks and manages message streaming
   * @private
   * @param data - the message chunk data containing id, content, and completion status
   */
  private handleMessageChunk(data: MessageChunkData): void {
    const { id, content, done } = data;

    // manage message queue and update existing messages
    const existingMessage = this.messageQueue.find((msg) => msg.id === id);
    if (existingMessage) {
      existingMessage.content += content;
    } else {
      this.messageQueue.push({ id, content });
      // initialize new message in store if no active message exists
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

    // handle message completion
    if (done && id === this.activeMessageId) {
      this.stopStreaming();
      store.dispatch(setStreamingFlag({ id, isStreaming: false }));
      store.dispatch(setIsGenerating(false));
      this.activeMessageId = null;

      this.processNextMessage();
    }
  }

  /**
   * initiates the streaming update interval for real-time message updates
   * @private
   */
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
    }, 100); // update frequency: 100ms
  }

  /**
   * stops the streaming update interval
   * @private
   */
  private stopStreaming(): void {
    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }
  }

  /**
   * processes the next message in the queue when current message completes
   * @private
   */
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

  /**
   * generates a mock response for development/testing
   * @private
   * @param content - the user's message content
   */
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
      
      // simulate message completion after delay
      setTimeout(() => {
        store.dispatch(setStreamingFlag({ id: messageId, isStreaming: false }));
        store.dispatch(setIsGenerating(false));
      }, 500);
      
    }, 800);
  }

  /**
   * generates appropriate mock responses based on user input keywords
   * @private
   * @param content - the user's message content
   * @returns a contextually appropriate mock response
   */
  private generateMockResponse(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('hello') || lowerContent.includes('hi')) {
      return "Hello! How can I assist you today? I'm here to help with any questions or tasks you might have.";
    } else if (lowerContent.includes('help')) {
      return "I'm here to help! I can answer questions, provide information, generate content, or assist with various tasks. What specific assistance do you need?";
    } else if (lowerContent.includes('code') || lowerContent.includes('function')) {
      return "Here's a JavaScript function example:\n\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}! Welcome to our application.`;\n}\n\n// Usage example\nconst message = greet('User');\nconsole.log(message); // Output: Hello, User! Welcome to our application.\n```\n\nThis function takes a name parameter and returns a personalized greeting message. Would you like me to explain how it works or modify it in any way?";
    } else if (lowerContent.includes('weather')) {
      return "I don't have access to real-time weather data, but I can suggest checking a weather service like AccuWeather, Weather.com, or using your device's built-in weather app for the most current information.\n\nIf you're building a weather app, you might want to look into APIs like OpenWeatherMap or WeatherAPI that provide programmatic access to weather data.";
    } else if (lowerContent.includes('explain') || lowerContent.includes('what is')) {
      return "I'd be happy to explain! When providing explanations, I try to be clear, accurate, and thorough. Without more specific details about what you'd like me to explain, I can say that effective explanations often include:\n\n1. Clear definitions of key terms\n2. Real-world examples or analogies\n3. Breaking complex ideas into simpler components\n4. Visual aids when appropriate\n5. Connections to existing knowledge\n\nCould you please specify what topic or concept you'd like me to explain?";
    } else if (lowerContent.includes('long') || lowerContent.includes('paragraph')) {
      return "Here's a longer response with multiple paragraphs for testing streaming functionality:\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam auctor, nisl eget ultricies tincidunt, nisl nisl aliquam nisl, eget aliquam nisl nisl eget nisl. Nullam auctor, nisl eget ultricies tincidunt, nisl nisl aliquam nisl, eget aliquam nisl nisl eget nisl.\n\nPellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Integer euismod, nisl eget ultricies tincidunt, nisl nisl aliquam nisl, eget aliquam nisl nisl eget nisl. Nullam auctor, nisl eget ultricies tincidunt, nisl nisl aliquam nisl, eget aliquam nisl nisl eget nisl.\n\nCras mattis consectetur purus sit amet fermentum. Nullam id dolor id nibh ultricies vehicula ut id elit. Nullam quis risus eget urna mollis ornare vel eu leo. Nullam id dolor id nibh ultricies vehicula ut id elit.";
    } else if (lowerContent.includes('list') || lowerContent.includes('steps')) {
      return "Here's a numbered list example:\n\n1. First item in the list\n2. Second item with more details about what this entails\n3. Third item that might be even longer to demonstrate how text wrapping would work in a list context like this one\n4. Fourth item\n5. Fifth and final item in this example list\n\nAnd here's a bulleted list example:\n\n• Important point to consider\n• Another key aspect to remember\n• Something else that's noteworthy\n• Final bullet point";
    } else {
      return "Thank you for your message. I've processed your input, but I'm not sure exactly what you're looking for. Could you provide more details or clarify your question? I'm here to help with a wide range of topics and tasks.";
    }
  }

  /**
   * sends a message to the websocket server and manages the response
   * @param content - the message content to send
   * @param modelId - the id of the ai model to use
   * @returns the generated message id
   */
  sendMessage(content: string, modelId: string): string {
    store.dispatch(setIsGenerating(true));
    const messageId = uuidv4();

    store.dispatch(
      addMessage({
        content,
        role: 'user',
        chat_id: store.getState().chat.currentSessionId || '',
      })
    );

    if (this.mockMode) {
      this.mockResponse(content);
      return messageId;
    }

    if (!this.socket || !this.isConnected) {
      console.error('websocket connection unavailable');
      store.dispatch(setIsGenerating(false));
      return messageId;
    }

    this.socket.emit('send-message', {
      id: messageId,
      content,
      modelId,
    });

    return messageId;
  }

  /**
   * stops ongoing message generation
   */
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

  /**
   * cleanly disconnects the websocket connection
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }

    this.stopStreaming();
  }

  /**
   * Regenerates a specific message by its ID
   * @param messageId - The ID of the message to regenerate
   */
  regenerateMessage(messageId: string): void {
    console.log("Regenerating message with ID:", messageId);
    
    const state = store.getState();
    const sessionId = state.chat.currentSessionId;
    
    if (!sessionId) {
      console.error("No current session found");
      return;
    }
    
    const session = state.chat.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.error("Session not found");
      return;
    }
    
    // Find the message and any user message that preceded it
    const msgIndex = session.messages.findIndex(m => m.id === messageId);
    if (msgIndex <= 0) {
      console.error("No preceding user message found");
      return;
    }
    
    // Get the user message that prompted this response
    const userMessage = session.messages[msgIndex - 1];
    
    // Validate that the user message is actually a user message
    if (userMessage.role !== 'user') {
      console.error("Previous message is not a user message");
      return;
    }
    
    // Mark as generating
    store.dispatch(setIsGenerating(true));
    
    // Call regenerateResponse with the message ID to replace for in-place regeneration
    this.regenerateResponse(userMessage.content, state.chat.currentModelId, messageId);
  }
  
  /**
   * Regenerates a response without creating a new user message
   * Used for regenerating responses after editing or for redo functionality
   * @param content - the original user message content 
   * @param modelId - the model to use for generation
   * @param replaceMessageId - optional ID of message to replace (for in-place regeneration)
   */
  regenerateResponse(content: string, modelId: string, replaceMessageId?: string): void {
    console.log("=== REGENERATE RESPONSE CALLED ===");
    console.log("Content:", content.substring(0, 30) + "...");
    console.log("Model ID:", modelId);
    console.log("Replace Message ID:", replaceMessageId);
    
    // Set generating state
    store.dispatch(setIsGenerating(true));
    
    if (this.mockMode) {
      // In mock mode, simulate response generation
      console.log("Using mock mode for regeneration");
      
      // Generate response content
      const responseContent = this.generateMockResponse(content);
      console.log("Generated mock response length:", responseContent.length);
      
      // If we have a message ID to replace, update that message
      if (replaceMessageId) {
        console.log("Replacing existing message:", replaceMessageId);
        
        // Get current state
        const state = store.getState();
        
        // Debug log the current sessions state
        console.log("Current sessions state:", 
          state.chat.sessions.map(s => ({
            id: s.id, 
            messageCount: s.messages.length
          }))
        );
        
        const sessionId = state.chat.currentSessionId;
        console.log("Current session ID:", sessionId);
        
        if (!sessionId) {
          console.error("No current session found");
          store.dispatch(setIsGenerating(false));
          return;
        }
        
        // Find the session
        const session = state.chat.sessions.find(s => s.id === sessionId);
        if (!session) {
          console.error("Session not found");
          store.dispatch(setIsGenerating(false));
          return;
        }
        
        console.log("Found session with messages:", 
          session.messages.map(m => ({ id: m.id, role: m.role }))
        );
        
        // Find the message to verify it exists
        const targetMessage = session.messages.find(m => m.id === replaceMessageId);
        if (!targetMessage) {
          console.error(`Target message ${replaceMessageId} not found in current session`);
          store.dispatch(setIsGenerating(false));
          return;
        }
        
        console.log("Found target message to update:", targetMessage);
        
        try {
          // First clear the content (this is important)
          store.dispatch(updateMessage({
            id: replaceMessageId,
            content: '...'  // Start with ellipsis to indicate loading
          }));
          
          // Then mark as streaming (separate action to avoid race conditions)
          store.dispatch(setStreamingFlag({ 
            id: replaceMessageId, 
            isStreaming: true 
          }));
          
          console.log("Starting content streaming simulation");
          
          // Use a simple approach to simulate streaming
          setTimeout(() => {
            // Stream response character by character with 30ms delay between updates
            let currentIndex = 0;
            
            // Create a recursive function to handle streaming
            const streamText = () => {
              if (currentIndex >= responseContent.length) {
                // We're done streaming
                console.log("Finished streaming");
                
                // Make sure we have the complete content
                store.dispatch(updateMessage({
                  id: replaceMessageId,
                  content: responseContent
                }));
                
                // Clear streaming flag
                store.dispatch(setStreamingFlag({ 
                  id: replaceMessageId, 
                  isStreaming: false 
                }));
                
                // Clear generating state
                store.dispatch(setIsGenerating(false));
                return;
              }
              
              // Determine how many characters to add
              const charsToAdd = Math.min(
                Math.floor(Math.random() * 4) + 1,
                responseContent.length - currentIndex
              );
              
              // Update the index
              currentIndex += charsToAdd;
              
              // Get the current substring
              const partialContent = responseContent.substring(0, currentIndex);
              
              // Update the message
              store.dispatch(updateMessage({
                id: replaceMessageId,
                content: partialContent
              }));
              
              // Schedule the next update
              setTimeout(streamText, 30);
            };
            
            // Start streaming
            streamText();
          }, 300);
        } catch (error) {
          console.error("Error during regeneration:", error);
          store.dispatch(setIsGenerating(false));
        }
      } else {
        // No message to replace, create a new one
        console.log("No message ID to replace, creating new message");
        
        setTimeout(() => {
          try {
            const messageId = uuidv4();
            console.log("Created new message with ID:", messageId);
            
            // Add the bot response
            store.dispatch(
              addMessage({
                id: messageId, // Explicitly set the ID
                content: responseContent,
                role: 'assistant',
                chat_id: store.getState().chat.currentSessionId || '',
                is_streaming: true,
              })
            );
            
            // Set streaming flags
            store.dispatch(setStreamingFlag({ id: messageId, isStreaming: true }));
            
            // Simulate message completion after delay
            setTimeout(() => {
              store.dispatch(setStreamingFlag({ id: messageId, isStreaming: false }));
              store.dispatch(setIsGenerating(false));
              console.log("Completed streaming for new message");
            }, 500);
          } catch (error) {
            console.error("Error creating new message:", error);
            store.dispatch(setIsGenerating(false));
          }
        }, 800);
      }
      
      return;
    }
    
    // Non-mock mode API code would go here
    if (!this.socket || !this.isConnected) {
      console.error('WebSocket connection unavailable');
      store.dispatch(setIsGenerating(false));
      return;
    }
    
    // Send regenerate request to server
    this.socket.emit('regenerate-response', {
      content,
      modelId,
      replaceMessageId
    });
  }
}

// export a singleton instance
export default new WebSocketManager();
