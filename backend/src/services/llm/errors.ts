export class LLMServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ModelInitializationError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'MODEL_INIT_ERROR', 500, context);
  }
}

export class InvalidConfigError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'INVALID_CONFIG', 400, context);
  }
}

export class ChatCompletionError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CHAT_COMPLETION_ERROR', 500, context);
  }
}

export class StreamingError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'STREAMING_ERROR', 500, context);
  }
}

export class ValidationError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

export class SanitizationError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SANITIZATION_ERROR', 400, context);
  }
}

export class QueueError extends LLMServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'QUEUE_ERROR', 500, context);
  }
}

export class RetryableError extends LLMServiceError {
  constructor(
    message: string,
    code: string = 'RETRYABLE_ERROR',
    context?: Record<string, any>
  ) {
    super(message, code, 503, context);
  }
}

// Utility to check if an error is retryable
export function isRetryableError(error: any): boolean {
  if (error instanceof RetryableError) return true;
  
  // Network errors, rate limits, and temporary service disruptions
  if (error instanceof ChatCompletionError || error instanceof StreamingError) {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'RATE_LIMIT'];
    return retryableCodes.some(code => error.message.includes(code));
  }

  return false;
} 