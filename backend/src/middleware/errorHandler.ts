/**
 * global error handler middleware
 * 
 * provides consistent error responses across the apis
 * logs errors and formats them for client consumption
 * 
 * this consists of:
 * 1. error classification
 * 2. error structuring
 * 3. error handling 
 * 
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

// map of error types to handler functions
type ErrorHandler = (err: any) => {
    statusCode: number;
    message: string;
    code?: string;
    details?: string[];
}

/**
 * custom api error class for consistent error handling
 * extends native error class with additional properties
 */
export class ApiError extends Error {
    statusCode: number;
    code?: string;
    context?: Record<string, unknown>;

    constructor(statusCode: number, message: string, options?: {
        code?: string;
        context?: Record<string, unknown>
    }) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ApiError';
        this.code = options?.code;
        this.context = options?.context;

        // capture stack trace for debugging during development
        if (process.env.NODE_ENV !== 'production') {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * create a not found error (404)
     */
    static noFound(message = "resource not found", options?: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(404, message, options);
    }

    /**
     * create a bad request error (400)
     */
    static badRequest(message = "bad request", options?: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(400, message, options);
    }

    /**
     * create an unauthorized error (401)
     */
    static unauthorized(message = "unauthorized", options: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(401, message, options);
    }

    /**
     * create a forbidden error (403)
     */
    static forbidden(message = "forbidden", options: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(403, message, options);
    }

    /**
     * create an internal server error (500)
     */
    static internal(message = "internal server error", optional?: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(500, message, optional);
    }

    /**
     * create a bad gateway error (502)
     */
    static badGateway(message = "bad gateway", optional?: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(502, message, optional);
    }

    /**
     * create a service unavailable error (503)
     */
    static serviceUnavailable(message = "service unavailable", optional?: {code?: string, context?: Record<string, unknown>}): ApiError {
        return new ApiError(503, message, optional);
    }
}

// error handler mapping
const errorHandlers: Record<string, ErrorHandler> = {
    'ApiError': (err: ApiError) => ({
        statusCode: err.statusCode,
        message: err.message,
        code: err.code,
        details: err.context ? Object.entries(err.context).map(([key, value]) => `${key}: ${value}`) : undefined
    }),
    'ZodError': (err: ZodError) => ({
        statusCode: 400,
        message: 'validation error',
        code: "VALIDATION_ERROR",
        details: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
    }),

    'JsonWebTokenError': () => ({
        statusCode: 401,
        message: 'invalid JWT token',
        code: 'INAVALID_TOKEN'
    }),
    
    'TokenExpiredError': () => ({
        statusCode: 401,
        message: 'JWT token expired',
        code: 'TOKEN_EXPIRED'
    })
};

// default error handler
const defaultErrorHandler: ErrorHandler = (err) => ({
    statusCode: 500,
    message: 'internal server error',
    code: 'INTERNAL_SERVER_ERROR'
});

// special error handler for axios errors
function axiosErrorHandler(err: any): ReturnType<ErrorHandler> {
    const responseData = err.response?.data;
    return {
        statusCode: 502,
        message: 'external service error',
        code: 'EXTERNAL_SERVICE_ERROR',
        details: [responseData?.error || responseData?.message || err.message]
    };
}

/**
 * global error handling middleware
 * @param err
 * @param req 
 * @param res 
 * @param next 
*/
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // determine error type and get handler (with default fallback)
    const handler = errorHandlers[err.name] ||
                    ((err as any).isAxiosError ? axiosErrorHandler : defaultErrorHandler);

    // process the error
    const { statusCode, message, code, details } = handler(err);                    

    // appropriate logging based on status code
    // log full error details only for server errors
    if (statusCode >= 500) {
        logger.error('server error', {
            path: `${req.method} ${req.path}`,
            message: err.message,
            stack: err.stack,
            requestId: req.headers['x-request-id']
        });
    }   else {
            logger.warn('client error', {
            path: `${req.method} ${req.path}`,
            statusCode,
            message: err.message,
            requestId: req.headers['x-request-id']
        });
    }

  // send response - using a single object construction for efficiency
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(details?.length && { details }),
      timestamp: new Date().toISOString(),
      requestId: req.headers['x-request-id'] || undefined
    }
  });
};

/**
 * async handler with minimal overhead
 * wraps express routes to properly catch and forward async errors to the error handler
 */
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
