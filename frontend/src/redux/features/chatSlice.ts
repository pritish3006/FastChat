/**
 * chat slice 🔥
 * handles all our chat stuff - sessions, messages, models & ui state
 * built with @reduxjs/toolkit + typescript
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ChatState, Message, ChatSession, Model, MessageBranch } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * initial state check:
 * - empty sessions array
 * - no current chat selected
 * - gpt-4 set as default model - this will be replaced with the actual model id from the backend
 */
const initialState: ChatState = {
  sessions: [],
  currentSessionId: null,
  // TODO: replace with actual models from the backend
  availableModels: [
    { id: 'gpt-4', name: 'GPT-4', isActive: true },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isActive: false },
    { id: 'claude-3', name: 'Claude 3', isActive: false },
    { id: 'llama-3', name: 'Llama 3', isActive: false }
  ],
  currentModelId: 'gpt-4',
  isGenerating: false,
  isSidebarOpen: false,
  error: null,
  editingMessageId: null,
  activeBranchId: null,
  currentBranchIndex: 0,
};

/**
 * grabs chat history from backend (todo)
 * TODO: replace simulated API callwith actual backend call
 */
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

/**
 * main slice w/ all our actions
 */
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // starts fresh chat
    createNewSession: (state) => {
      const newSessionId = uuidv4();
      const newSession: ChatSession = {
        id: newSessionId,
        title: 'New Chat',
        model_id: state.currentModelId || state.availableModels[0].id,
        created_at: Date.now(),
        updated_at: Date.now(),
        messages: [],
        branches: [],
        activeBranchId: null
      };
      
      state.sessions.push(newSession);
      state.currentSessionId = newSessionId;
      state.activeBranchId = null;
      state.currentBranchIndex = 0;
    },
    
    // switches active chat
    setCurrentSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
      // Reset branch state when switching sessions
      state.activeBranchId = null;
      state.currentBranchIndex = 0;
    },
    
    // yeets a chat into the void
    // be careful with this one, it's a one-way trip
    deleteSession: (state, action: PayloadAction<string>) => {
      state.sessions = state.sessions.filter(session => session.id !== action.payload);
      if (state.currentSessionId === action.payload) {
        state.currentSessionId = state.sessions.length > 0 ? state.sessions[0].id : null;
        state.activeBranchId = null;
        state.currentBranchIndex = 0;
      }
    },
    
    // adds new message, makes new chat if needed
    addMessage: (state, action: PayloadAction<Partial<Message>>) => {
      if (!state.currentSessionId) {
        // Create a new session if none exists
        const newSessionId = uuidv4();
        const newSession: ChatSession = {
          id: newSessionId,
          title: 'New Chat',
          model_id: state.currentModelId || state.availableModels[0].id,
          created_at: Date.now(),
          updated_at: Date.now(),
          messages: [],
          branches: [],
          activeBranchId: null
        };
        
        state.sessions.push(newSession);
        state.currentSessionId = newSessionId;
      }
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex !== -1) {
        const newMessage: Message = {
          id: uuidv4(),
          role: action.payload.role || 'user',
          content: action.payload.content || '',
          timestamp: Date.now(),
          is_streaming: action.payload.is_streaming || false,
          is_error: action.payload.is_error || false,
          chat_id: state.currentSessionId
        };
        
        state.sessions[sessionIndex].messages.push(newMessage);
        state.sessions[sessionIndex].updated_at = Date.now();
        
        // Update session title based on first user message
        // TODO: replace with an LLM call to generate a title based on the first user message
        // TODO: debounce this to avoid spamming the LLM
        if (action.payload.role === 'user' && state.sessions[sessionIndex].messages.length === 1) {
          const title = action.payload.content.slice(0, 30);
          state.sessions[sessionIndex].title = title + (title.length === 30 ? '...' : '');
        }
      }
    },
    
    // updates message content and creates a branch
    updateMessage: (state, action: PayloadAction<{ id: string; content: string }>) => {
      if (!state.currentSessionId) {
        console.error("updateMessage: No current session ID");
        return;
      }
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex === -1) {
        console.error(`updateMessage: Session not found: ${state.currentSessionId}`);
        return;
      }
      
      const messageIndex = state.sessions[sessionIndex].messages.findIndex(
        message => message.id === action.payload.id
      );
      
      if (messageIndex === -1) {
        console.error(`updateMessage: Message not found: ${action.payload.id}`);
        return;
      }
      
      const currentSession = state.sessions[sessionIndex];
      const editedMessage = currentSession.messages[messageIndex];
      
      // Check if this message already has branches
      const isFirstEdit = !editedMessage.branch_point;
      
      // Create a branch from the current message thread
      if (isFirstEdit) {
        // Mark the original message as a branch point
        currentSession.messages[messageIndex].branch_point = true;
        
        // Store all messages after the edited message in a new branch
        const messagesAfter = currentSession.messages.slice(messageIndex + 1);
        
        if (messagesAfter.length > 0) {
          // Create a new branch with the original thread
          const newBranch: MessageBranch = {
            id: uuidv4(),
            parentMessageId: editedMessage.id,
            messages: [
              // Include the original version of the edited message
              { ...editedMessage, id: uuidv4() },
              // And all subsequent messages
              ...messagesAfter
            ],
            createdAt: Date.now()
          };
          
          // Add the branch to the session
          currentSession.branches.push(newBranch);
        }
      }
      
      // Update the version number for the edited message
      const currentVersion = currentSession.messages[messageIndex].version || 0;
      currentSession.messages[messageIndex].version = currentVersion + 1;
      
      // Update the message content
      currentSession.messages[messageIndex].content = action.payload.content;
      currentSession.updated_at = Date.now();
      
      // Remove all messages after the edited one from the main thread
      currentSession.messages = currentSession.messages.slice(0, messageIndex + 1);
      
      // Create a new branch from the current edit
      if (currentSession.messages[messageIndex].branch_point && currentSession.branches.length > 0) {
        // Reset branch navigation
        state.currentBranchIndex = 0;
        state.activeBranchId = null;
      }
    },
    
    // handles streaming state
    setStreamingFlag: (state, action: PayloadAction<{ id: string; isStreaming: boolean }>) => {
      if (!state.currentSessionId) {
        console.error("setStreamingFlag: No current session ID");
        return;
      }
      
      const sessionIndex = state.sessions.findIndex(
        session => session.id === state.currentSessionId
      );
      
      if (sessionIndex === -1) {
        console.error(`setStreamingFlag: Session not found: ${state.currentSessionId}`);
        return;
      }
      
      const messageIndex = state.sessions[sessionIndex].messages.findIndex(
        message => message.id === action.payload.id
      );
      
      if (messageIndex === -1) {
        console.error(`setStreamingFlag: Message not found: ${action.payload.id}`);
        return;
      }
      
      // Update the streaming flag
      state.sessions[sessionIndex].messages[messageIndex].is_streaming = action.payload.isStreaming;
    },
    
    // switches ai model
    setCurrentModel: (state, action: PayloadAction<string>) => {
      state.currentModelId = action.payload;
      
      // update the active state for all models
      state.availableModels = state.availableModels.map(model => ({
        ...model,
        isActive: model.id === action.payload
      }));
    },
    
    // ai response loading state
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
    },
    
    // sidebar toggle
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    
    // force sidebar state
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    
    // removes a message
    removeMessage: (state, action: PayloadAction<string>) => {
      if (state.currentSessionId) {
        const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
        if (sessionIndex !== -1) {
          state.sessions[sessionIndex].messages = state.sessions[sessionIndex].messages.filter(
            m => m.id !== action.payload
          );
        }
      }
    },
    
    // reducer to track message being edited
    setEditingMessageId: (state, action: PayloadAction<string | null>) => {
      state.editingMessageId = action.payload;
    },
    
    // Navigate to previous branch
    navigateToPreviousBranch: (state) => {
      if (!state.currentSessionId) return;
      
      const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
      if (sessionIndex === -1) return;
      
      const session = state.sessions[sessionIndex];
      
      // Find the branch point message
      const branchPointIndex = session.messages.findIndex(m => m.branch_point);
      if (branchPointIndex === -1) return;
      
      const parentMessageId = session.messages[branchPointIndex].id;
      
      // Get branches for this parent message
      const branches = session.branches.filter(b => b.parentMessageId === parentMessageId);
      
      if (branches.length === 0) return;
      
      // If we're in the main branch (which is conceptually the "newest" branch)
      if (!state.activeBranchId && state.currentBranchIndex === 0) {
        // Switch to the most recent branch (n-1)
        state.activeBranchId = branches[0].id;
        state.currentBranchIndex = 1;
      } 
      // If we're already in a branch, go to an older branch
      else if (state.activeBranchId) {
        const currentBranchIndex = branches.findIndex(b => b.id === state.activeBranchId);
        
        // If we found the branch and we're not at the oldest one
        if (currentBranchIndex !== -1 && currentBranchIndex < branches.length - 1) {
          // Move to the next older branch (increase index to move toward 1)
          state.activeBranchId = branches[currentBranchIndex + 1].id;
          state.currentBranchIndex = currentBranchIndex + 2; // +2 because main branch is 0, and array is 0-indexed
        }
        // If we're at the oldest branch, loop back to main branch (current/newest)
        else if (currentBranchIndex === branches.length - 1) {
          state.activeBranchId = null;
          state.currentBranchIndex = 0;
        }
      }
    },
    
    // Navigate to next branch
    navigateToNextBranch: (state) => {
      if (!state.currentSessionId) return;
      
      const sessionIndex = state.sessions.findIndex(s => s.id === state.currentSessionId);
      if (sessionIndex === -1) return;
      
      const session = state.sessions[sessionIndex];
      
      // Find the branch point message
      const branchPointIndex = session.messages.findIndex(m => m.branch_point);
      if (branchPointIndex === -1) return;
      
      const parentMessageId = session.messages[branchPointIndex].id;
      
      // Get branches for this parent message
      const branches = session.branches.filter(b => b.parentMessageId === parentMessageId);
      
      if (branches.length === 0) return;
      
      // If we're in the oldest branch (conceptually branch #1)
      if (state.activeBranchId) {
        const currentBranchIndex = branches.findIndex(b => b.id === state.activeBranchId);
        
        // If found and not at newest branch
        if (currentBranchIndex !== -1 && currentBranchIndex > 0) {
          // Move to a newer branch (decrease index to move toward n)
          state.activeBranchId = branches[currentBranchIndex - 1].id;
          state.currentBranchIndex = currentBranchIndex; // The index goes from high to low as branches get newer
        }
        // If we're at the newest branch (#2)
        else if (currentBranchIndex === 0) {
          // Go to main branch (the current branch, #n)
          state.activeBranchId = null;
          state.currentBranchIndex = 0;
        }
      }
      // If we're in the main branch (newest, #n)
      else if (!state.activeBranchId && state.currentBranchIndex === 0) {
        // Go to the oldest branch (#1)
        state.activeBranchId = branches[branches.length - 1].id;
        state.currentBranchIndex = branches.length;
      }
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

// Export the chat slice actions
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
  setSidebarOpen,
  removeMessage, 
  setEditingMessageId,
  navigateToPreviousBranch,
  navigateToNextBranch
} = chatSlice.actions;

export default chatSlice.reducer;
