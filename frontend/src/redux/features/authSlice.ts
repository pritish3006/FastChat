
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User } from '@/types';

/**
 * Initial state for the authentication slice
 * @property {User | null} user - The current authenticated user or null if not authenticated
 * @property {boolean} isAuthenticated - Whether the user is authenticated
 * @property {boolean} isLoading - Whether an authentication operation is in progress
 * @property {string | null} error - Any error message from the last authentication operation
 */
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

/**
 * Authentication slice for Redux
 * Maintains a minimal auth state for future implementation
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Clears any authentication errors
     */
    clearError: (state) => {
      state.error = null;
    },
    
    /**
     * Sets user data and authentication state
     */
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    
    /**
     * Sets loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    }
  }
});

export const { clearError, setUser, setLoading } = authSlice.actions;
export default authSlice.reducer;
