
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './features/authSlice';
import chatReducer from './features/chatSlice';
import uiReducer from './features/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    chat: chatReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
