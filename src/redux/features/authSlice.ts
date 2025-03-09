
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User } from '@/types';
import { supabase } from '@/utils/supabaseClient';

/**
 * Initial state for the authentication slice
 * @property {User | null} user - The current authenticated user or null if not authenticated
 * @property {boolean} isAuthenticated - Whether the user is authenticated
 * @property {boolean} isLoading - Whether an authentication operation is in progress
 * @property {string | null} error - Any error message from the last authentication operation
 * @property {boolean} isDevMode - Whether the app is using development mode authentication
 */
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isDevMode: false,
};

/**
 * Async thunk for user registration
 * Creates a new user account with email, password, and username
 */
export const signup = createAsyncThunk(
  'auth/signup',
  async ({ email, password, username }: { email: string; password: string; username: string }, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) throw new Error(error.message);
      return data.user as User;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for user login
 * Authenticates a user with email and password
 */
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error(error.message);
      return data.user as User;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for user logout
 * Signs the current user out
 */
export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      return null;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk to get the current session
 * Checks if a user is already authenticated
 */
export const getSession = createAsyncThunk(
  'auth/getSession',
  async (_, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
      return data.session?.user as User || null;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Mock authentication function for development
 * Creates a fake user session without requiring Supabase authentication
 * IMPORTANT: Should be disabled in production environments
 */
export const mockLogin = createAsyncThunk(
  'auth/mockLogin',
  async (_, { dispatch }) => {
    try {
      console.log('Mock login initiated');
      
      // Create a mock user object
      const mockUser: User = {
        id: 'mock-user-id-123',
        email: 'dev@example.com',
        username: 'DevUser',
        created_at: new Date().toISOString(),
      };
      
      console.log('Mock user created:', mockUser);
      localStorage.setItem('devModeEnabled', 'true');
      
      // Return the mock user - this will be picked up by the fulfilled case
      return mockUser;
    } catch (error: any) {
      console.error('Mock login failed:', error);
      throw error;
    }
  }
);

/**
 * Exit development mode and clear local storage
 */
export const exitDevMode = createAsyncThunk(
  'auth/exitDevMode',
  async () => {
    localStorage.removeItem('devModeEnabled');
    return null;
  }
);

/**
 * Check if dev mode is enabled in local storage
 */
export const checkDevMode = createAsyncThunk(
  'auth/checkDevMode',
  async () => {
    const isDevMode = localStorage.getItem('devModeEnabled') === 'true';
    
    if (isDevMode) {
      // Create a mock user object if in dev mode
      const mockUser: User = {
        id: 'mock-user-id-123',
        email: 'dev@example.com',
        username: 'DevUser',
        created_at: new Date().toISOString(),
      };
      return mockUser;
    }
    
    return null;
  }
);

/**
 * Authentication slice for Redux
 * Manages user authentication state and operations
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
     * Force sets the authenticated state (for development/testing only)
     */
    setAuthenticated: (state, action: PayloadAction<boolean>) => {
      state.isAuthenticated = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Signup
    builder.addCase(signup.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(signup.fulfilled, (state, action: PayloadAction<User>) => {
      state.isLoading = false;
      state.user = action.payload;
      state.isAuthenticated = true;
    });
    builder.addCase(signup.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
    });

    // Login
    builder.addCase(login.pending, (state) => {
      state.isLoading = true;
      state.error = null;
    });
    builder.addCase(login.fulfilled, (state, action: PayloadAction<User>) => {
      state.isLoading = false;
      state.user = action.payload;
      state.isAuthenticated = true;
    });
    builder.addCase(login.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
    });

    // Logout
    builder.addCase(logout.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(logout.fulfilled, (state) => {
      state.isLoading = false;
      state.user = null;
      state.isAuthenticated = false;
    });
    builder.addCase(logout.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
    });

    // Get Session
    builder.addCase(getSession.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(getSession.fulfilled, (state, action: PayloadAction<User | null>) => {
      state.isLoading = false;
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    });
    builder.addCase(getSession.rejected, (state, action) => {
      state.isLoading = false;
      state.user = null;
      state.isAuthenticated = false;
      state.error = action.payload as string;
    });

    // Mock Login
    builder.addCase(mockLogin.pending, (state) => {
      state.isLoading = true;
      state.error = null;
      console.log('Mock login pending');
    });
    builder.addCase(mockLogin.fulfilled, (state, action: PayloadAction<User>) => {
      state.isLoading = false;
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isDevMode = true;
      console.log('Mock login fulfilled, user authenticated in dev mode:', state.isAuthenticated);
    });
    builder.addCase(mockLogin.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
      console.error('Mock login rejected:', action.payload);
    });
    
    // Check Dev Mode
    builder.addCase(checkDevMode.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(checkDevMode.fulfilled, (state, action: PayloadAction<User | null>) => {
      if (action.payload) {
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isDevMode = true;
        console.log('Dev mode detected, user auto-authenticated');
      } else {
        state.isDevMode = false;
      }
    });
    
    // Exit Dev Mode
    builder.addCase(exitDevMode.fulfilled, (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isDevMode = false;
      console.log('Exited dev mode');
    });
  },
});

export const { clearError, setAuthenticated } = authSlice.actions;
export default authSlice.reducer;
