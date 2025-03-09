
import { User } from '@/types';

/**
 * Authentication utility functions
 * Provides helper methods for common authentication tasks
 */

/**
 * Formats user data for display or storage
 * 
 * @param {User} user - The user object to format
 * @returns {Object} Formatted user data
 */
export const formatUserData = (user: User) => {
  return {
    id: user.id,
    email: user.email,
    username: user.username || user.email.split('@')[0],
    created: new Date(user.created_at).toLocaleDateString(),
  };
};

/**
 * Checks if a user has admin privileges
 * 
 * @param {User} user - The user to check
 * @returns {boolean} Whether the user has admin privileges
 */
export const isAdmin = (user: User | null): boolean => {
  // This is a placeholder for actual admin check logic
  return user?.email === 'admin@example.com';
};

/**
 * Creates a development-only mock user
 * 
 * @param {string} role - Optional role for the mock user
 * @returns {User} A mock user object
 */
export const createMockUser = (role?: string): User => {
  return {
    id: `mock-${role || 'user'}-${Date.now()}`,
    email: role ? `${role}@example.com` : 'test@example.com',
    username: role ? `${role.charAt(0).toUpperCase() + role.slice(1)}User` : 'TestUser',
    created_at: new Date().toISOString(),
  };
};
