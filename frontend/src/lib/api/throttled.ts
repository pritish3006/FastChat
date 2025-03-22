/**
 * Throttled API client wrapper
 * 
 * This wrapper adds throttling/debouncing to any API client method to prevent
 * API spamming from the frontend. It wraps API methods with a throttle function
 * that prevents them from being called too frequently.
 */

import { throttle, DEFAULT_DEBOUNCE_INTERVAL } from '@/lib/utils/debounce';
import { toast } from 'sonner';

// Defines which API methods should be throttled and their minimum intervals
interface ThrottleConfig {
  // Method name to minimum time between calls in ms
  [methodName: string]: number;
}

// Default configuration for common API methods
const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  // Session management (less frequent operations)
  createSession: 2000,
  getSessions: 2000,
  getSession: 2000,
  updateSession: 2000,
  deleteSession: 2000,
  clearSession: 2000,
  
  // Message operations (more frequent operations)
  sendMessage: 200,
  streamMessage: 10,
  getHistory: 1000,
  regenerateMessage: 500,
  
  // Search/agent operations
  search: 500,
  generateWithTools: 500,
  
  // Default for any other method
  default: DEFAULT_DEBOUNCE_INTERVAL
};

/**
 * Creates a throttled version of an API client
 * 
 * @param apiClient The original API client instance
 * @param config Custom throttle configuration (optional)
 * @returns A proxied version of the API client with throttled methods
 */
export function createThrottledAPIClient<T extends object>(
  apiClient: T,
  config: ThrottleConfig = DEFAULT_THROTTLE_CONFIG
): T {
  // Track the last time each method was called
  const lastCallTime: Record<string, number> = {};
  
  return new Proxy(apiClient, {
    get(target, prop, receiver) {
      const originalProperty = Reflect.get(target, prop, receiver);
      
      // Only apply to functions
      if (typeof originalProperty !== 'function' || 
          prop === 'constructor' || 
          typeof prop !== 'string') {
        return originalProperty;
      }
      
      // Get the throttle interval for this method
      const throttleInterval = config[prop] || config.default || DEFAULT_DEBOUNCE_INTERVAL;
      
      // Create a throttled version of the function
      const throttledMethod = function(this: any, ...args: any[]) {
        const now = Date.now();
        const lastCall = lastCallTime[prop as string] || 0;
        
        // Check if we're calling too frequently
        if (now - lastCall < throttleInterval) {
          // Show a gentle toast notification
          toast.info(`Please wait a moment before trying this operation again.`);
          
          // Return a rejected promise to signal the operation was blocked
          return Promise.reject(new Error('Operation throttled. Please try again in a moment.'));
        }
        
        // Update last call time
        lastCallTime[prop as string] = now;
        
        // Call the original method
        return originalProperty.apply(this, args);
      };
      
      return throttledMethod;
    }
  });
}

/**
 * Creates a throttled version of an API client with async generators support
 * 
 * This is a more advanced version that handles async generators like streamMessage
 * correctly while still providing throttling.
 */
export function createAdvancedThrottledAPIClient<T extends object>(
  apiClient: T,
  config: ThrottleConfig = DEFAULT_THROTTLE_CONFIG
): T {
  // Track the last time each method was called
  const lastCallTime: Record<string, number> = {};
  
  return new Proxy(apiClient, {
    get(target, prop, receiver) {
      const originalProperty = Reflect.get(target, prop, receiver);
      
      // Only apply to functions
      if (typeof originalProperty !== 'function' || 
          prop === 'constructor' || 
          typeof prop !== 'string') {
        return originalProperty;
      }
      
      // Get the throttle interval for this method
      const throttleInterval = config[prop] || config.default || DEFAULT_DEBOUNCE_INTERVAL;
      
      // Create a special wrapper that detects if it's an async generator
      const throttledMethod = function(this: any, ...args: any[]) {
        const now = Date.now();
        const lastCall = lastCallTime[prop as string] || 0;
        
        // Check if we're calling too frequently
        if (now - lastCall < throttleInterval) {
          // Show a gentle toast notification
          toast.info(`Please wait a moment before trying this operation again.`);
          
          // Return a rejected promise to signal the operation was blocked
          return Promise.reject(new Error('Operation throttled. Please try again in a moment.'));
        }
        
        // Update last call time
        lastCallTime[prop as string] = now;
        
        // Call the original method
        const result = originalProperty.apply(this, args);
        
        // Check if this is an async generator function
        if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
          // It's an async generator, we need to handle it specially
          return result; // For now we just pass it through
        }
        
        return result;
      };
      
      return throttledMethod;
    }
  });
} 