
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/authSlice';
import chatReducer from './features/chatSlice';
import uiReducer from './features/uiSlice';

/**
 * Redux store configuration
 * 
 * Combines all reducers and configures the Redux store
 * Includes middleware settings for optimal performance
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,  // Authentication state management
    chat: chatReducer,  // Chat session and message state
    ui: uiReducer,      // UI state like modals, theme, etc.
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Allows non-serializable data in the store
    }),
});

// TypeScript type definitions for the store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
