import {
  APIConfig,
  APIError,
  APIResponse,
  RequestOptions,
  StreamChunk,
} from './types';

/**
 * Base API client with common functionality
 */
export abstract class BaseAPIClient {
  protected readonly config: APIConfig;
  private readonly isDev = import.meta.env.DEV;

  constructor(config: APIConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || import.meta.env.VITE_API_URL || 'http://localhost:3001',
    };
  }

  /**
   * Make a GET request
   */
  protected async get<T>(path: string, options: Partial<RequestOptions> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  protected async post<T>(path: string, data?: unknown, options: Partial<RequestOptions> = {}): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: data,
    });
  }

  /**
   * Make a PUT request
   */
  protected async put<T>(path: string, data?: unknown, options: Partial<RequestOptions> = {}): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: data,
    });
  }

  /**
   * Make a DELETE request
   */
  protected async delete<T>(path: string, options: Partial<RequestOptions> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * Create an SSE connection for streaming data
   */
  protected async *stream<T>(path: string, options: Partial<RequestOptions> = {}): AsyncGenerator<StreamChunk<T>> {
    const url = this.resolveUrl(path);
    const eventSource = new EventSource(url);
    
    try {
      while (true) {
        const chunk = await new Promise<StreamChunk<T>>((resolve, reject) => {
          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              resolve(data);
            } catch (error) {
              reject(new APIError('Failed to parse stream data'));
            }
          };

          eventSource.onerror = () => {
            reject(new APIError('Stream connection error'));
          };
        });

        yield chunk;

        if (chunk.done || chunk.error) {
          break;
        }
      }
    } finally {
      eventSource.close();
    }
  }

  /**
   * Make a request with retry logic
   */
  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.config.timeout,
      retryAttempts = this.config.retryAttempts,
      signal,
    } = options;

    const url = this.resolveUrl(path);
    let attempts = 0;

    while (attempts <= retryAttempts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers,
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: signal || controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorDetails;
          try {
            errorDetails = await response.json();
          } catch {
            // If parsing fails, proceed without details
          }
          throw APIError.fromResponse(response, errorDetails);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        attempts++;
        
        if (error instanceof APIError && error.status === 401) {
          // Handle authentication errors differently
          throw error;
        }

        if (attempts > retryAttempts || error.name === 'AbortError') {
          throw APIError.fromError(error as Error);
        }

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => 
          setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts), 10000))
        );
      }
    }

    throw new APIError('Max retry attempts reached');
  }

  /**
   * Resolve a URL from a path
   */
  private resolveUrl(path: string): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.replace(/^\//, '');
    return `${baseUrl}/${normalizedPath}`;
  }
} 