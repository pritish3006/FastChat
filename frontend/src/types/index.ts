// User types
export interface User {
  id: string;
  email: string;
  avatar_url?: string;
  username?: string;
  created_at: string;
}

// Auth state types (simplified)
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// Model types
export interface Model {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  isActive: boolean;
}

// Branch types
export interface MessageBranch {
  id: string;
  parentMessageId: string;  // The message that was edited to create this branch
  messages: Message[];      // Messages in this branch
  createdAt: number;        // When this branch was created
  name?: string;            // Optional user-provided name for this branch
}

// Message types
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  chat_id: string;
  is_streaming?: boolean;
  is_error?: boolean;
  branch_point?: boolean;   // Whether this message has branches
  original_id?: string;     // If this is an edited message, the id of the original
  version?: number;         // Version number for edited messages
}

// Chat session types
export interface ChatSession {
  id: string;
  title: string;
  model_id: string;
  created_at: number;
  updated_at: number;
  messages: Message[];
  branches: MessageBranch[]; // All branches in this session
  activeBranchId: string | null; // Currently active branch ID
}

// Chat state types
export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  availableModels: Model[];
  currentModelId: string | null;
  isGenerating: boolean;
  isSidebarOpen: boolean;
  error: string | null;
  editingMessageId: string | null;
  activeBranchId: string | null; // Currently selected branch
  currentBranchIndex: number;    // Current index in branch navigation
}

// Tool types
export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  isEnabled: boolean;
}

// UI state types
export interface UIState {
  availableTools: Tool[];
  isProfileMenuOpen: boolean;
  isToolsMenuOpen: boolean;
  activeTool: string | null;
  theme: 'light' | 'dark';
}
