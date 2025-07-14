import { configService } from './config';

type EventCallback = (...args: any[]) => void;

export type ChatEventType = 
  | 'message:start'
  | 'message:chunk'
  | 'message:complete'
  | 'message:error'
  | 'generation:stop'
  | 'connection:error'
  | 'connection:retry';

/**
 * Event emitter for handling application-wide events
 */
class EventEmitter {
  private events: Map<string, EventCallback[]> = new Map();

  on(event: ChatEventType, callback: EventCallback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(callback);
  }

  off(event: ChatEventType, callback: EventCallback) {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event: ChatEventType, ...args: any[]) {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(...args));
    }
  }

  removeAllListeners(event?: ChatEventType) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

/**
 * SSE Manager for handling server-sent events
 */
class SSEManager {
  private eventSource: EventSource | null = null;
  private retryCount: number = 0;
  private config = configService.getSSEConfig();

  constructor(private events: EventEmitter) {}

  connect(url: string) {
    if (this.eventSource) {
      this.disconnect();
    }

    this.eventSource = new EventSource(url);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    if (!this.eventSource) return;

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.events.emit('message:chunk', data);
      } catch (error) {
        this.events.emit('message:error', 'Failed to parse message data');
      }
    };

    this.eventSource.onerror = () => {
      this.handleError();
    };

    // Reset retry count on successful connection
    this.eventSource.onopen = () => {
      this.retryCount = 0;
    };
  }

  private handleError() {
    this.events.emit('connection:error');
    
    if (this.retryCount < this.config.maxRetryAttempts) {
      this.retryCount++;
      this.events.emit('connection:retry', this.retryCount);
      
      setTimeout(() => {
        if (this.eventSource?.url) {
          this.connect(this.eventSource.url);
        }
      }, this.config.retryInterval);
    } else {
      this.disconnect();
      this.events.emit('message:error', 'Max retry attempts reached');
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Create and export singleton instances
export const eventEmitter = new EventEmitter();
export const sseManager = new SSEManager(eventEmitter); 