/**
 * Swagger/OpenAPI Configuration Module
 * 
 * This module configures Swagger/OpenAPI documentation for the Fast Chat API.
 * It sets up the API specification including server configurations, security schemes,
 * and documentation scanning paths.
 * 
 * @module config/swagger
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';
import path from 'path';

/**
 * Swagger configuration options
 * 
 * @property {Object} definition - OpenAPI specification definition
 * @property {string} definition.openapi - OpenAPI version (3.0.0)
 * @property {Object} definition.info - API information including title, version etc
 * @property {Array} definition.servers - Array of server configurations
 * @property {Object} definition.components - Reusable components like security schemes
 * @property {Array} definition.security - Global security requirements
 * @property {Array} apis - Glob patterns for files containing API documentation
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Fast Chat API Documentation',
      version,
      description: 'API documentation for Fast Chat backend services',
      contact: {
        name: 'API Support',
        email: 'support@fastchat.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.fastchat.com', 
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }],
    // Set base path for all routes
    basePath: '/api/v1'
  },
  apis: [
    path.resolve(__dirname, '../routes/*.ts'),  // Absolute path to route files
    path.resolve(__dirname, '../types/*.ts'),   // Absolute path to type definitions
    path.resolve(__dirname, '../models/*.ts')   // Absolute path to data models
  ],
  // Ensure all JSDoc comments are parsed correctly
  failOnErrors: true
};

/**
 * Generated Swagger/OpenAPI specification
 * This is used by swagger-ui-express to serve the API documentation
 */
export const swaggerSpec = swaggerJsdoc(options);

// Log when Swagger spec is generated (useful for debugging)
console.log('Swagger specification generated successfully');