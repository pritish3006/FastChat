import { configureStore, Middleware } from '@reduxjs/toolkit';
import chatReducer from './slices/chatSlice';
import uiReducer from './slices/uiSlice';
import authReducer from './slices/authSlice';

// Middleware to sync state with localStorage
const persistenceMiddleware: Middleware = store => next => (action: any) => {
  const result = next(action);
  const state = store.getState();
  
  // Save chat state to localStorage
  // chat state is a snapshot of all the active sessions and relevant details at the time of storage in localStorage
  if (action.type?.startsWith('chat/')) {
    localStorage.setItem('chatState', JSON.stringify({
      sessions: state.chat.sessions,
      currentSessionId: state.chat.currentSessionId,
      currentModel: state.chat.currentModel,
      lastSyncTimestamp: new Date().toISOString(),
    }));
    
    // Debug log for persistence
    console.log('Persisted state:', {
      currentModel: state.chat.currentModel,
      action: action.type
    });
  }
  
  return result;
};

// Load persisted state from localStorage
const loadPersistedState = () => {
  try {
    const persistedState = localStorage.getItem('chatState');
    if (persistedState) {
      return JSON.parse(persistedState);
    }
  } catch (error) {
    console.error('Failed to load persisted state:', error);
  }
  return undefined;
};

// Session debug middleware
const sessionDebugMiddleware: Middleware = store => next => (action: any) => {
  // Only log session-related actions to avoid console clutter
  if (
    action.type?.startsWith('chat/fetchSessions') ||
    action.type?.startsWith('chat/createSession') ||
    action.type === 'chat/resetSessions' ||
    action.type === 'chat/syncTimestamp'
  ) {
    // grabbing the current sessions from the state tree before action is processed
    const prevSessions = store.getState().chat.sessions;  // store.getState() - redux store function to access current state tree
    
    console.group(`🔍 SESSION ACTION: ${action.type}`);
    console.log('Previous Sessions:', {
      count: prevSessions.length, // count of sessions in the state tree
      ids: prevSessions.slice(0, 3).map(s => s.id), // slice the first 3 sessions and map over them to get the ids
      hasMore: prevSessions.length > 3 // check if there are more than 3 sessions
    });
    console.log('Action:', { 
      type: action.type,        // type of action (chat/fetchSessions, chat/createSession, chat/resetSessions, chat/syncTimestamp)
      payload: action.payload,  // payload of the action (optional) - data associated with the action
      meta: action.meta        // meta of the action (optional) additional information about the action
    });
    
    // Let the action proceed
    const result = next(action);
    
    // Log the new state
    const newSessions = store.getState().chat.sessions;
    console.log('New Sessions:', {
      count: newSessions.length,
      ids: newSessions.slice(0, 3).map(s => s.id),
      hasMore: newSessions.length > 3,
      changed: newSessions.length !== prevSessions.length
    });
    
    // compare the 
    if (action.type === 'chat/fetchSessions/fulfilled') {
      console.log('Full sessions state after fetch:', newSessions);
    }
    
    console.groupEnd();
    return result;
  }
  
  return next(action);
};

// Configure store with persistence
export const store = configureStore({
  reducer: {
    chat: chatReducer,
    ui: uiReducer,
    auth: authReducer,
  },
  preloadedState: {
    chat: loadPersistedState(), // load persisted state from localStorage - pick up where we left off
    // not preloading ui or auth for security and simplified state management
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types in serializability check
        ignoredActions: ['chat/sendMessage/fulfilled'],   
      },
    }).concat(persistenceMiddleware, sessionDebugMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch; 