
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, Message, ChatSession, Model } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const initialState: ChatState = {
  sessions: [],
  currentSessionId: null,
  availableModels: [
    { id: 'gpt-4', name: 'GPT-4', isActive: true },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isActive: false },
    { id: 'claude-3', name: 'Claude 3', isActive: false },
    { id: 'llama-3', name: 'Llama 3', isActive: false }
  ],
  currentModelId: 'gpt-4',
  isGenerating: false,
  isSidebarOpen: false,
  error: null
};

// Simulated API call to fetch chat history
export const fetchChatSessions = createAsyncThunk(
  'chat/fetchChatSessions',
  async (userId: string, { rejectWithValue }) => {
    try {
      // This would be replaced with an actual API call to fetch chat sessions
      // For now, we're returning an empty array
      return [] as ChatSession[];
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    createNewSession: (state) => {
      const newSessionId = uuidv4();
      const newSession: ChatSession = {
        id: newSessionId,
        title: 'New Chat',
        model_id: state.currentModelId || state.availableModels[0].id,
        created_at: Date.now(),
        updated_at: Date.now(),
        messages: []
      };
      
      state.sessions.push(newSession);
      state.currentSessionId = newSessionId;
    },
    
    setCurrentSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
    },
    
    deleteSession: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter(session => session.id !== action.payload);
      if (state.currentSessionId === action.payload) {
        state.currentSessionId = state.sessions.length > 0 ? state.sessions[0].id : null;
      }
    },
    
    addMessage: (state, action: PayloadAction<Omit<Message, 'id' | 'timestamp'>>) => {
      if (!state.currentSessionId) {
        // Create a new session if none exists
        const newSessionId = uuidv4();
        const newSession: ChatSession = {
          id: newSessionId,
          title: 'New Chat',
          model_id: state.currentModelId || state.availableModels[0].id,
          created_at: Date.now(),
          updated_at: Date.now(),
          messages: []
        };
        
        state.sessions.push(newSession);
        state.currentSessionId = newSessionId;
      }
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex !== -1) {
        const newMessage: Message = {
          ...action.payload,
          id: uuidv4(),
          timestamp: Date.now(),
          chat_id: state.currentSessionId
        };
        
        state.sessions[sessionIndex].messages.push(newMessage);
        state.sessions[sessionIndex].updated_at = Date.now();
        
        // Update session title based on first user message
        if (action.payload.role === 'user' && state.sessions[sessionIndex].messages.length === 1) {
          const title = action.payload.content.slice(0, 30);
          state.sessions[sessionIndex].title = title + (title.length === 30 ? '...' : '');
        }
      }
    },
    
    updateMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      if (!state.currentSessionId) return;
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex !== -1) {
        const messageIndex = state.sessions[sessionIndex].messages.findIndex(
          message => message.id === action.payload.id
        );
        
        if (messageIndex !== -1) {
          state.sessions[sessionIndex].messages[messageIndex].content = action.payload.content;
          state.sessions[sessionIndex].updated_at = Date.now();
        }
      }
    },
    
    setStreamingFlag: (state, action: PayloadAction<{ id: string; isStreaming: boolean }>) => {
      if (!state.currentSessionId) return;
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex !== -1) {
        const messageIndex = state.sessions[sessionIndex].messages.findIndex(
          message => message.id === action.payload.id
        );
        
        if (messageIndex !== -1) {
          state.sessions[sessionIndex].messages[messageIndex].is_streaming = action.payload.isStreaming;
        }
      }
    },
    
    setCurrentModel: (state, action: PayloadAction<string>) => {
      state.currentModelId = action.payload;
      
      // Update the active state for all models
      state.availableModels = state.availableModels.map(model => ({
        ...model,
        isActive: model.id === action.payload
      }));
    },
    
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
    },
    
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder.addCase(fetchChatSessions.fulfilled, (state, action) => {
      state.sessions = action.payload;
      if (action.payload.length > 0 && !state.currentSessionId) {
        state.currentSessionId = action.payload[0].id;
      }
    });
    builder.addCase(fetchChatSessions.rejected, (state, action) => {
      state.error = action.payload as string;
    });
  }
});

export const {
  createNewSession,
  setCurrentSession,
  deleteSession,
  addMessage,
  updateMessage,
  setStreamingFlag,
  setCurrentModel,
  setIsGenerating,
  toggleSidebar,
  setSidebarOpen
} = chatSlice.actions;

export default chatSlice.reducer;
