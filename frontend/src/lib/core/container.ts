import { store } from '../store';
import { chatAPI } from '../api/chat/chat.api';
import { eventEmitter } from './events';
import { configService } from './config';
import { chatService } from '../services/chat.service';

/**
 * Service container for managing application dependencies
 */
class ServiceContainer {
  private initialized = false;

  /**
   * Initialize all services with proper dependencies
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize chat service with dependencies
      chatService.initialize({
        api: chatAPI,
        events: eventEmitter,
        config: configService,
      });

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Clean up all services and connections
   */
  async cleanup() {
    try {
      sseManager.disconnect();
      eventEmitter.removeAllListeners();
      this.initialized = false;
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service instances
   */
  getServices() {
    if (!this.initialized) {
      throw new Error('Services not initialized. Call initialize() first.');
    }

    return {
      config: configService,
      events: eventEmitter,
      sse: sseManager,
      chat: chatService,
    };
  }
}

// Export singleton instance
export const container = new ServiceContainer(); 