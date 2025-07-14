/**
 * rate limiter middleware
 * 
 * protects api from abuse by limiting request rates.
 * configurable per route with different limits.
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config/index';
import { ApiError } from './errorHandler';

// Get rate limit settings from environment variables or use defaults
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // default: 60000 ms (1 minute)
const DEFAULT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10); // default: 60 requests per minute

/**
 * creates a rate limiter with specific settings
 */
export function createRateLimiter(options?: {
  windowMs?: number;
  max?: number;
  message?: string;
}) {
  return rateLimit({
    windowMs: options?.windowMs || DEFAULT_WINDOW_MS,
    max: options?.max || DEFAULT_MAX_REQUESTS,
    standardHeaders: true, // return rate limit headers
    legacyHeaders: false, // don't use deprecated headers
    message: {
      success: false,
      error: {
        message: options?.message || 'too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
      }
    },
    handler: (req, res, next, options) => {
      // log rate limit exceeded
      const error = new ApiError(429, options.message?.error?.message || 'rate limit exceeded', {
        code: 'RATE_LIMIT_EXCEEDED'
      });
      next(error);
    }
  });
}

// specific rate limiters for different routes
export const defaultLimiter = createRateLimiter();

// stricter limit for auth endpoints
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: 'too many authentication attempts, please try again later'
});

// stricter limit for model endpoints (where we make LLM API calls)
export const chatLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: 'you are sending messages too quickly, please slow down'
}); 