import { isRetryableError } from '../errors';

interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  onRetry: () => {},
};

/**
 * Implements AWS-style decorrelated jitter backoff algorithm
 * See: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
function getBackoffTime(base: number, cap: number, attempt: number): number {
  const temp = Math.min(cap, base * Math.pow(2, attempt));
  return Math.min(cap, Math.random() * (temp - base) + base);
}

/**
 * Retries a function with decorrelated jitter backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      
      if (
        attempt >= opts.maxAttempts ||
        !isRetryableError(error)
      ) {
        throw error;
      }

      const delay = getBackoffTime(
        opts.baseDelay,
        opts.maxDelay,
        attempt
      );

      opts.onRetry(error as Error, attempt);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
} 