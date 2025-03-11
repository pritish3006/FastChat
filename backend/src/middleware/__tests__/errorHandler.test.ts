import { Request, Response } from 'express';
import { ApiError, errorHandler } from '../errorHandler';
import { ZodError, z } from 'zod';

// mock the logger to prevent console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      path: '/test',
      headers: {
        'x-request-id': 'test-request-id'
      }
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    nextFunction = jest.fn();
  });

  it('should handle ApiError properly', () => {
    const apiError = new ApiError(400, 'bad input', { code: 'INVALID_INPUT' });
    
    errorHandler(
      apiError,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'bad input',
        code: 'INVALID_INPUT',
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      }
    });
  });

  it('should handle ZodError validation errors', () => {
    const schema = z.object({
      email: z.string().email(),
    });
    
    const validationError = new ZodError(
      schema.safeParse({ email: 'invalid' }).error.issues
    );
    
    errorHandler(
      validationError,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'validation error',
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      }
    });
  });

  it('should handle unknown errors as internal server errors', () => {
    const unknownError = new Error('something went wrong');
    
    errorHandler(
      unknownError,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'internal server error',
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      }
    });
  });

  it('should handle axios errors as external service errors', () => {
    const axiosError = new Error('network error');
    (axiosError as any).isAxiosError = true;
    (axiosError as any).response = {
      data: { error: 'service unavailable' }
    };
    
    errorHandler(
      axiosError,
      mockRequest as Request,
      mockResponse as Response,
      nextFunction
    );

    expect(mockResponse.status).toHaveBeenCalledWith(502);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'external service error',
        code: 'EXTERNAL_SERVICE_ERROR',
        details: ['service unavailable'],
        timestamp: expect.any(String),
        requestId: 'test-request-id'
      }
    });
  });
});

describe('ApiError class', () => {
  it('should create error with correct properties', () => {
    const error = new ApiError(404, 'user not found', { 
      code: 'USER_NOT_FOUND',
      context: { userId: '123' }
    });
    
    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('user not found');
    expect(error.code).toBe('USER_NOT_FOUND');
    expect(error.context).toEqual({ userId: '123' });
  });

  it('should create errors using static methods', () => {
    const notFoundError = ApiError.notFound('product not found');
    expect(notFoundError.statusCode).toBe(404);
    
    const badRequestError = ApiError.badRequest();
    expect(badRequestError.statusCode).toBe(400);
    
    const unauthorizedError = ApiError.unauthorized();
    expect(unauthorizedError.statusCode).toBe(401);
    
    const forbiddenError = ApiError.forbidden();
    expect(forbiddenError.statusCode).toBe(403);
    
    const internalError = ApiError.internal();
    expect(internalError.statusCode).toBe(500);
    
    const badGatewayError = ApiError.badGateway();
    expect(badGatewayError.statusCode).toBe(502);
    
    const serviceUnavailableError = ApiError.serviceUnavailable();
    expect(serviceUnavailableError.statusCode).toBe(503);
  });
}); 