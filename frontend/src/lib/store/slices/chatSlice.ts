import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, Message, ChatSession } from '@/lib/types/chat';
// Use the direct export names since the index files may not be properly resolved
import { chatAPI } from '@/lib/api/chat/chat.api';
import { sessionsAPI } from '@/lib/api/sessions/sessions.api';
import { createThrottledAPIClient } from '@/lib/api/throttled';
import { modelsAPI } from '@/lib/api/models/models.api';
import { v4 as uuidv4 } from 'uuid';

// Create throttled versions of the APIs
const throttledChatAPI = createThrottledAPIClient(chatAPI);
const throttledSessionsAPI = createThrottledAPIClient(sessionsAPI);

// Helper function to convert API session to ChatSession
function convertToChatSession(apiSession: any): ChatSession {
  // Ensure all required fields are present
  const session: ChatSession = {
    id: apiSession.id,
    title: apiSession.title || 'Untitled',
    modelId: apiSession.modelId || 'gpt-3.5-turbo',
    createdAt: apiSession.createdAt || new Date().toISOString(),
    messageCount: apiSession.messageCount || 0,
    messages: apiSession.messages || [],
    // Mandatory fields from the ChatSession interface
    lastAccessedAt: apiSession.lastAccessedAt || apiSession.updatedAt || new Date().getTime(),
  };
  
  // Add optional fields if they exist
  if (apiSession.updatedAt) session.updatedAt = apiSession.updatedAt;
  if (apiSession.branches) session.branches = apiSession.branches;
  if (apiSession.lastMessage) session.lastMessage = apiSession.lastMessage;
  if (apiSession.activeBranchId) session.activeBranchId = apiSession.activeBranchId;
  
  return session;
}

// Helper function to convert API message to Message
function convertToMessage(apiMessage: any): Message {
  return {
    id: apiMessage.id,
    content: apiMessage.content,
    role: apiMessage.role === 'system' ? 'assistant' : apiMessage.role,
    timestamp: apiMessage.timestamp || new Date().toISOString(),
    createdAt: apiMessage.createdAt || apiMessage.timestamp || new Date().toISOString(),
    sessionId: apiMessage.sessionId || apiMessage.chat_id,
    is_error: apiMessage.is_error || false,
    is_streaming: apiMessage.is_streaming || false,
    branch_point: apiMessage.branch_point || false,
    version: apiMessage.version || 1,
    metadata: apiMessage.metadata || {},
  };
}

// Async thunks for API integration
export const fetchSessions = createAsyncThunk(
  'chat/fetchSessions',
  async (_, { rejectWithValue }) => {
    try {
      // Use throttled API
      const sessions = await throttledSessionsAPI.getSessions();
      return sessions.map(session => convertToChatSession(session));
    } catch (error: any) {
      console.error('Failed to fetch sessions:', error);
      return rejectWithValue(error.message || 'Failed to fetch sessions');
    }
  }
);

export const createSession = createAsyncThunk(
  'chat/createSession',
  async ({ title, modelId }: { title?: string; modelId?: string }, { getState, rejectWithValue }) => {
    try {
      // Get current state
      const state = getState() as { chat: ChatState };
      
      // If no specific model is provided, use the current model from state or localStorage
      const modelToUse = modelId || state.chat.currentModel || localStorage.getItem('selectedModel') || 'gpt-3.5-turbo';
      
      console.log('Creating session with model:', modelToUse);
      
      // Use throttled API
      const session = await throttledSessionsAPI.createSession({ 
        title, 
        modelId: modelToUse 
      });
      
      if (!session || !session.id) {
        throw new Error('Invalid session response');
      }
      
      return session;
    } catch (error: any) {
      console.error('Failed to create session:', error);
      return rejectWithValue(error.message || 'Failed to create session');
    }
  }
);

export const deleteSession = createAsyncThunk(
  'chat/deleteSession',
  async (id: string, { rejectWithValue }) => {
    try {
      // Use throttled API
      await throttledSessionsAPI.deleteSession(id);
      return id;
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      return rejectWithValue(error.message || 'Failed to delete session');
    }
  }
);

export const clearSession = createAsyncThunk(
  'chat/clearSession',
  async (id: string, { rejectWithValue }) => {
    try {
      // Use throttled API
      await throttledChatAPI.clearSession(id);
      return id;
    } catch (error: any) {
      console.error('Failed to clear session:', error);
      return rejectWithValue(error.message || 'Failed to clear session');
    }
  }
);

export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (data: {
    content: string;
    sessionId: string;
    modelId: string;
    metadata?: any;
  }, { rejectWithValue, dispatch }) => {
    try {
      // Use throttled API for sending messages
      const response = await throttledChatAPI.sendMessage({
        content: data.content,
        sessionId: data.sessionId,
        modelId: data.modelId,
        config: data.metadata
      });
      
      return response.messages;
    } catch (error: any) {
      console.error('Failed to send message:', error);
      return rejectWithValue(error.message || 'Failed to send message');
    }
  }
);

export const updateCurrentModel = createAsyncThunk(
  'chat/updateCurrentModel',
  async (modelId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { chat: ChatState };
      const { currentSessionId } = state.chat;
      
      // If there's a current session, update its model as well
      if (currentSessionId) {
        // Use throttled API with correct parameter format
        await throttledSessionsAPI.updateSession({ 
          sessionId: currentSessionId, 
          modelId 
        });
      }
      
      return modelId;
    } catch (error: any) {
      console.error('Failed to update model:', error);
      return rejectWithValue(error.message || 'Failed to update model');
    }
  }
);

const initialState: ChatState = {
  sessions: [],
  currentSessionId: null,
  currentModel: localStorage.getItem('selectedModel') || 'gpt-3.5-turbo',
  isGenerating: false,
  editingMessageId: null,
  activeBranchId: null,
  currentBranchIndex: 0,
  error: null,
  lastSyncTimestamp: null,
  isSidebarOpen: true,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<Message>) => {
      const session = state.sessions.find(s => s.id === state.currentSessionId);
      if (session) {
        session.messages.push(action.payload);
        
        // Use type-safe property access
        if ('lastMessage' in session) {
          session.lastMessage = action.payload;
        }
        
        session.messageCount = (session.messageCount || 0) + 1;
        
        // Add timestamp in a type-safe way
        const now = new Date().toISOString();
        if ('updatedAt' in session) {
          session.updatedAt = now;
        }
      }
    },
    
    setCurrentSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
      state.activeBranchId = null;
      state.currentBranchIndex = 0;
    },
    
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
    },
    
    setEditingMessageId: (state, action: PayloadAction<string | null>) => {
      state.editingMessageId = action.payload;
    },
    
    setActiveBranchId: (state, action: PayloadAction<string | null>) => {
      state.activeBranchId = action.payload;
    },
    
    setCurrentBranchIndex: (state, action: PayloadAction<number>) => {
      state.currentBranchIndex = action.payload;
    },

    updateMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      const session = state.sessions.find(s => s.id === state.currentSessionId);
      if (session) {
        const message = session.messages.find(m => m.id === action.payload.id);
        if (message) {
          message.content = action.payload.content;
          
          // Add timestamp in a type-safe way
          const now = new Date().toISOString();
          if ('updatedAt' in session) {
            session.updatedAt = now;
          }
        }
      }
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    syncTimestamp: (state) => {
      state.lastSyncTimestamp = new Date().toISOString();
    },

    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    
    // New action to reset sessions state
    resetSessions: (state) => {
      console.log('Resetting sessions state');
      state.sessions = [];
      state.currentSessionId = null;
      state.lastSyncTimestamp = new Date().toISOString();
    },

    // New action to handle direct API fetch sync
    directFetchSync: (state, action: PayloadAction<ChatSession[]>) => {
      console.group('🔄 REDUCER: directFetchSync');
      const directSessions = action.payload;
      
      console.log('Syncing directly fetched sessions to Redux state', {
        directSessionCount: directSessions.length,
        currentReduxCount: state.sessions.length
      });
      
      if (directSessions.length > 0) {
        // Only update if direct sessions actually contain data
        // Replace sessions completely to ensure a fresh reference for React
        state.sessions = [...directSessions];
        
        // Only update current session ID if we don't already have one
        if (!state.currentSessionId && directSessions.length > 0) {
          state.currentSessionId = directSessions[0].id;
          console.log('Setting current session from direct fetch:', directSessions[0].id);
        }
        
        // Update lastSyncTimestamp to trigger component re-renders
        state.lastSyncTimestamp = new Date().toISOString();
        console.log(`Updated lastSyncTimestamp: ${state.lastSyncTimestamp}`);
      } else {
        console.log('No sessions received from direct fetch, state unchanged');
      }
      
      console.groupEnd();
    },
  },
  extraReducers: (builder) => {
    // Fetch Sessions
    builder.addCase(fetchSessions.fulfilled, (state, action) => {
      console.group('🔄 REDUCER: fetchSessions.fulfilled');
      console.log('Reducer received payload:', {
        payloadLength: action.payload.length,
        sampleSession: action.payload.length > 0 ? action.payload[0] : 'No sessions',
        fullPayload: action.payload
      });
      console.log('Previous state:', {
        sessionCount: state.sessions.length,
        currentSessionId: state.currentSessionId,
        sessionsReference: state.sessions
      });
      
      // IMPORTANT: Create a completely new sessions array to ensure React detects the change
      state.sessions = [...action.payload];
      
      // Log the new sessions array for debugging
      console.log('State after sessions update:', {
        newSessionCount: state.sessions.length,
        sessionIds: state.sessions.map(s => s.id).slice(0, 3),
        areEqual: state.sessions === action.payload, // Should be false (different references)
        sessionsReference: state.sessions
      });
      
      // Update error state
      state.error = null;
      
      // Only set current session if none is selected and we have sessions
      if (!state.currentSessionId && action.payload.length > 0) {
        state.currentSessionId = action.payload[0].id;
        console.log('Setting current session ID to:', action.payload[0].id);
      }
      
      // Update lastSyncTimestamp to trigger component re-renders
      const now = new Date().toISOString();
      state.lastSyncTimestamp = now;
      console.log(`Updated lastSyncTimestamp to: ${now}`);
      
      console.log('Final state:', {
        sessionCount: state.sessions.length,
        currentSessionId: state.currentSessionId,
        lastSyncTimestamp: state.lastSyncTimestamp
      });
      console.groupEnd();
    });
    builder.addCase(fetchSessions.rejected, (state, action) => {
      console.error('❌ fetchSessions rejected:', action.payload);
      state.error = action.payload as string;
    });

    // Create Session
    builder.addCase(createSession.pending, (state) => {
      state.error = null;
    });
    builder.addCase(createSession.fulfilled, (state, action) => {
      // Convert API response to our ChatSession format
      const apiSession = action.payload;
      
      // Create a new ChatSession with required fields
      const newSession: ChatSession = {
        id: apiSession.id,
        title: apiSession.title || 'New Chat',
        modelId: apiSession.modelId || state.currentModel,
        createdAt: apiSession.createdAt || new Date().getTime(),
        messageCount: apiSession.messageCount || 0,
        messages: [], // API session doesn't include messages initially
        // Add optional fields if they exist in the API response
        ...(apiSession.lastAccessedAt && { lastAccessedAt: apiSession.lastAccessedAt }),
        ...(apiSession.branches && { branches: apiSession.branches }),
      };
      
      console.log('Creating new session:', newSession);
      
      // Add to beginning of sessions array
      state.sessions.unshift(newSession);
      
      // Always set as current session
      state.currentSessionId = newSession.id;
      console.log('Set current session to:', newSession.id);
      
      state.error = null;
      state.editingMessageId = null;
      state.activeBranchId = null;
      state.currentBranchIndex = 0;
    });
    builder.addCase(createSession.rejected, (state, action) => {
      state.error = action.payload as string;
    });

    // Delete Session
    builder.addCase(deleteSession.fulfilled, (state, action) => {
      state.sessions = state.sessions.filter(session => session.id !== action.payload);
      if (state.currentSessionId === action.payload) {
        state.currentSessionId = state.sessions.length > 0 ? state.sessions[0].id : null;
      }
      state.error = null;
    });
    builder.addCase(deleteSession.rejected, (state, action) => {
      state.error = action.payload as string;
    });

    // Clear Session
    builder.addCase(clearSession.fulfilled, (state, action) => {
      const session = state.sessions.find(s => s.id === action.payload);
      if (session) {
        session.messages = [];
        session.messageCount = 0;
        // Use optional chaining for properties that might not be defined in the interface
        if ('lastMessage' in session) {
          session.lastMessage = undefined;
        }
        // Add timestamp in a type-safe way
        const now = new Date().toISOString();
        if ('updatedAt' in session) {
          session.updatedAt = now;
        }
      }
      state.error = null;
    });
    builder.addCase(clearSession.rejected, (state, action) => {
      state.error = action.payload as string;
    });

    // Send Message
    builder.addCase(sendMessage.pending, (state) => {
      state.isGenerating = true;
      state.error = null;
    });
    builder.addCase(sendMessage.fulfilled, (state, action) => {
      const session = state.sessions.find(s => s.id === state.currentSessionId);
      if (session) {
        const message = convertToMessage(action.payload);
        session.messages.push(message);
        
        // Use type-safe property access
        if ('lastMessage' in session) {
          session.lastMessage = message;
        }
        
        session.messageCount = (session.messageCount || 0) + 1;
        
        // Add timestamp in a type-safe way
        const now = new Date().toISOString();
        if ('updatedAt' in session) {
          session.updatedAt = now;
        }
      }
      state.isGenerating = false;
    });
    builder.addCase(sendMessage.rejected, (state, action) => {
      state.isGenerating = false;
      state.error = action.payload as string;
    });

    // Update model change handler
    builder.addCase(updateCurrentModel.fulfilled, (state, action) => {
      console.log('Model update fulfilled:', action.payload);
      state.currentModel = action.payload;
      // Update session model if exists
      const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
      if (currentSession) {
        currentSession.modelId = action.payload;
      }
      state.isGenerating = false;
      state.editingMessageId = null;
    })
    .addCase(updateCurrentModel.rejected, (state, action) => {
      console.error('Model update rejected:', action.payload);
      state.error = action.payload as string;
    });
  },
});

export const {
  addMessage,
  setCurrentSession,
  setIsGenerating,
  setEditingMessageId,
  setActiveBranchId,
  setCurrentBranchIndex,
  updateMessage,
  setError,
  syncTimestamp,
  toggleSidebar,
  resetSessions,
  directFetchSync,
} = chatSlice.actions;

export default chatSlice.reducer; 