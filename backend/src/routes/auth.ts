/**
 * auth routes
 * 
 * handles user authentication and profile management.
 */

import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// apply rate limiter to all auth routes
router.use(authLimiter);

// login route
router.post('/login', (req, res) => {
  // placeholder for login implementation
  // in a real app, this would validate credentials and return a JWT
  res.json({ 
    success: true,
    message: 'login successful',
    // generate a mock token for now
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4OTAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.4Cy_F1RRj7v2no3KDW7gIQTmjwGmEJg8QlAHWqLvJ8o',
    user: {
      id: '1234567890',
      email: 'user@example.com',
      username: 'testuser'
    }
  });
});

// register route
router.post('/register', (req, res) => {
  // placeholder for registration implementation
  res.json({ 
    success: true,
    message: 'registration successful',
    // generate a mock token for now
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4OTAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJpYXQiOjE1MTYyMzkwMjJ9.4Cy_F1RRj7v2no3KDW7gIQTmjwGmEJg8QlAHWqLvJ8o',
    user: {
      id: '1234567890',
      email: 'user@example.com',
      username: 'testuser'
    }
  });
});

// protected route to get user profile
router.get('/profile', authenticate, (req, res) => {
  // req.user is added by auth middleware
  res.json({ 
    success: true,
    user: req.user 
  });
});

export default router; 