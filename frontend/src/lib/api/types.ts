/**
 * API Types and Interfaces
 */

export interface APIConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  headers?: Record<string, string>;
}

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retryAttempts?: number;
}

export interface APIErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Custom API Error class with typed error details
 */
export class APIError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: APIErrorDetails,
  ) {
    super(message);
    this.name = 'APIError';
  }

  static fromResponse(response: Response, details?: APIErrorDetails): APIError {
    const message = details?.message || `HTTP Error ${response.status}: ${response.statusText}`;
    return new APIError(message, response.status, details);
  }

  static fromError(error: Error): APIError {
    if (error instanceof APIError) return error;
    return new APIError(error.message || 'Unknown error occurred');
  }
}

/**
 * Backend API response format
 */
export interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Stream chunk type for SSE responses
 */
export interface StreamChunk<T extends { type: string }> {
  type: T['type'];
  content: string;
  messageId?: string;
  sessionId?: string;
  done?: boolean;
  error?: string;
}

/**
 * HTTP Methods supported by the API client
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request options for API calls
 */
export interface RequestOptions {
  method?: HTTPMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retryAttempts?: number;
  signal?: AbortSignal;
} 