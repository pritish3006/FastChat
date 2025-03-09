
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User } from '@/types';
import { supabase } from '@/utils/supabaseClient';

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

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

// Mock authentication function for development
export const mockLogin = createAsyncThunk(
  'auth/mockLogin',
  async (_, { rejectWithValue }) => {
    try {
      console.log('Mock login initiated');
      // Create a mock user object
      const mockUser: User = {
        id: 'mock-user-id-123',
        email: 'test@example.com',
        username: 'TestUser',
        created_at: new Date().toISOString(),
      };
      
      console.log('Mock user created:', mockUser);
      return mockUser;
    } catch (error: any) {
      console.error('Mock login failed:', error);
      return rejectWithValue('Mock authentication failed');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
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
      console.log('Mock login fulfilled, user authenticated:', state.isAuthenticated);
    });
    builder.addCase(mockLogin.rejected, (state, action) => {
      state.isLoading = false;
      state.error = action.payload as string;
      console.error('Mock login rejected:', action.payload);
    });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
