/**
 * Chat Throttling Utilities
 * 
 * A collection of hooks and utilities for throttling chat-related operations
 * to prevent API spam and provide a better user experience.
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

// Default intervals for different operations
export const THROTTLE_INTERVALS = {
  SESSION_CREATE: 2000,   // 2 seconds between session creations
  SESSION_DELETE: 2000,   // 2 seconds between session deletions
  SESSION_CLEAR: 2000,    // 2 seconds between session clears
  MODEL_CHANGE: 2000,     // 2 seconds between model changes
  MESSAGE_SEND: 1000,     // 1 second between message sends
  SEARCH_QUERY: 1000,     // 1 second between search queries
  DEFAULT: 1000           // Default for other operations
};

/**
 * Custom hook for creating a throttled callback
 * Returns a throttled function and a boolean indicating if the operation is throttled
 */
export function useChatThrottle<T extends (...args: any[]) => any>(
  callback: T,
  throttleMs: number = THROTTLE_INTERVALS.DEFAULT,
  errorMessage: string = 'Please wait a moment before trying again'
): [(...args: Parameters<T>) => Promise<ReturnType<T> | null>, () => boolean] {
  const lastActionTime = useRef<number>(0);
  const isThrottled = useRef<boolean>(false);
  
  // Check if currently throttled
  const checkThrottled = useCallback(() => {
    const now = Date.now();
    return now - lastActionTime.current < throttleMs;
  }, [throttleMs]);
  
  // The throttled function
  const throttledCallback = useCallback(async (...args: Parameters<T>) => {
    if (isThrottled.current || checkThrottled()) {
      toast.info(errorMessage);
      return null;
    }
    
    try {
      isThrottled.current = true;
      lastActionTime.current = Date.now();
      
      return await callback(...args);
    } finally {
      // Set a timeout to mark the function as not throttled after the interval
      setTimeout(() => {
        isThrottled.current = false;
      }, throttleMs);
    }
  }, [callback, checkThrottled, errorMessage, throttleMs]);
  
  return [throttledCallback, checkThrottled];
}

/**
 * Apply throttling to an async function
 * Returns a throttled version of the function
 */
export function createThrottledFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  throttleMs: number = THROTTLE_INTERVALS.DEFAULT,
  errorMessage: string = 'Please wait a moment before trying again'
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  let lastCallTime = 0;
  
  return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    const now = Date.now();
    
    if (now - lastCallTime < throttleMs) {
      toast.info(errorMessage);
      return null;
    }
    
    lastCallTime = now;
    return await fn(...args);
  };
}

/**
 * Apply throttling to a synchronous function
 * Returns a throttled version of the function
 */
export function createThrottledSyncFunction<T extends (...args: any[]) => any>(
  fn: T,
  throttleMs: number = THROTTLE_INTERVALS.DEFAULT,
  errorMessage: string = 'Please wait a moment before trying again'
): (...args: Parameters<T>) => ReturnType<T> | null {
  let lastCallTime = 0;
  
  return (...args: Parameters<T>): ReturnType<T> | null => {
    const now = Date.now();
    
    if (now - lastCallTime < throttleMs) {
      toast.info(errorMessage);
      return null;
    }
    
    lastCallTime = now;
    return fn(...args);
  };
}

/**
 * Apply throttling to a React event handler function (works with both sync and async)
 * Returns a throttled version of the event handler
 */
export function createThrottledEventHandler<E extends React.SyntheticEvent, T extends (event: E) => any>(
  handler: T,
  throttleMs: number = THROTTLE_INTERVALS.DEFAULT,
  errorMessage: string = 'Please wait a moment before trying again'
): (event: E) => Promise<ReturnType<T> | null> | ReturnType<T> | null {
  let lastCallTime = 0;
  
  return (event: E) => {
    const now = Date.now();
    
    if (now - lastCallTime < throttleMs) {
      event.preventDefault();
      toast.info(errorMessage);
      return null;
    }
    
    lastCallTime = now;
    const result = handler(event);
    
    // Handle both synchronous and asynchronous handlers
    if (result instanceof Promise) {
      return result.catch(error => {
        console.error('Error in throttled event handler:', error);
        throw error;
      });
    }
    
    return result;
  };
} 