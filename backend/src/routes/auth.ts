/**
 * auth routes
 * 
 * handles user authentication and profile management.
 */

import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/authMiddleware';

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: API for user authentication and profile management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated user ID
 *         email:
 *           type: string
 *           format: email
 *           description: User email address
 *         name:
 *           type: string
 *           description: User's full name
 *         avatar:
 *           type: string
 *           description: URL to user's avatar
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const router = Router();

// apply rate limiter to all auth routes
router.use(authLimiter);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login user
 *     description: Authenticate user and return JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many requests - rate limit exceeded
 */
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

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register new user
 *     description: Create a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid input or email already in use
 *       429:
 *         description: Too many requests - rate limit exceeded
 */
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

/**
 * @swagger
 * /api/v1/auth/profile:
 *   get:
 *     summary: Get user profile
 *     description: Retrieve the current user's profile information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - invalid or missing token
 */
// protected route to get user profile
router.get('/profile', authenticate, (req, res) => {
  // req.user is added by auth middleware
  res.json({ 
    success: true,
    user: req.user 
  });
});

export default router; 