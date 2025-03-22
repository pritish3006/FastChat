/**
 * Debounce utility functions for preventing API spam
 */

import { useRef, useCallback } from 'react';

// Default time in milliseconds to wait before executing the debounced function
export const DEFAULT_DEBOUNCE_INTERVAL = 1000;

/**
 * Create a debounced version of a function
 * 
 * @param func The function to debounce
 * @param wait Time in milliseconds to wait before executing
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = DEFAULT_DEBOUNCE_INTERVAL
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    const context = this;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      timeout = null;
      func.apply(context, args);
    }, wait);
  };
}

/**
 * Create a throttled version of a function that only executes once per wait period
 * 
 * @param func The function to throttle
 * @param wait Time in milliseconds between allowed executions
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number = DEFAULT_DEBOUNCE_INTERVAL
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return function(this: any, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= wait) {
      lastCall = now;
      func.apply(this, args);
    }
  };
}

/**
 * A React hook that returns a debounced version of a function that also tracks its call status
 * 
 * @param callback The function to debounce
 * @param delay Time in milliseconds to wait before executing
 * @returns [debouncedCallback, isDebouncing]
 */
export function useDebounceCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = DEFAULT_DEBOUNCE_INTERVAL
): [(...args: Parameters<T>) => void, () => boolean] {
  const timeout = useRef<NodeJS.Timeout | null>(null);
  const isDebouncing = useRef(false);
  const lastCall = useRef(0);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      
      // Skip if already debouncing or called too recently
      if (isDebouncing.current || now - lastCall.current < delay) {
        return;
      }
      
      isDebouncing.current = true;
      lastCall.current = now;
      
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
      
      timeout.current = setTimeout(() => {
        callback(...args);
        isDebouncing.current = false;
        timeout.current = null;
      }, delay);
    },
    [callback, delay]
  );

  const checkIsDebouncing = useCallback(() => isDebouncing.current, []);

  return [debouncedCallback, checkIsDebouncing];
}

/**
 * A React hook that creates a throttled function
 * 
 * @param callback The function to throttle
 * @param limit Time in milliseconds between allowed executions
 * @returns A throttled version of the function
 */
export function useThrottleCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number = DEFAULT_DEBOUNCE_INTERVAL
): (...args: Parameters<T>) => void {
  const lastCall = useRef(0);
  
  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall.current >= limit) {
        lastCall.current = now;
        callback(...args);
      }
    },
    [callback, limit]
  );
} 