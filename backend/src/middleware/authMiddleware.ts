/**
 * auth middleware
 * 
 * handles user authentication and route protection.
 * validates jwt tokens and attaches user data to request.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index';
import { ApiError } from './errorHandler';

// extend express request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        // add any other user properties you need
      };
    }
  }
}

/**
 * extracts the token from the request headers
 */
function getTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * middleware to protect routes that require authentication
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    // get token from header
    const token = getTokenFromHeader(req);
    
    if (!token) {
      throw new ApiError(401, 'authentication required');
    }
    
    // Get the JWT secret from environment variables or use a default
    const jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-for-development';
    
    // verify token
    const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
    
    // attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError(401, 'invalid or expired token'));
    } else {
      next(error);
    }
  }
}

/**
 * middleware to optionally authenticate
 * attaches user if token is valid but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // get token from header
    const token = getTokenFromHeader(req);
    
    if (token) {
      // Get the JWT secret from environment variables or use a default
      const jwtSecret = process.env.JWT_SECRET || 'default-jwt-secret-for-development';
      
      // verify token
      const decoded = jwt.verify(token, jwtSecret) as { id: string; email: string };
      
      // attach user to request
      req.user = {
        id: decoded.id,
        email: decoded.email
      };
    }
    
    next();
  } catch (error) {
    // just continue without user
    next();
  }
} 