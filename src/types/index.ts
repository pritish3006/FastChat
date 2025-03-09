// User types
export interface User {
  id: string;
  email: string;
  avatar_url?: string;
  username?: string;
  created_at: string;
}

// Auth types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isDevMode?: boolean;
}

// Model types
export interface Model {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  isActive: boolean;
}

// Message types
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  chat_id: string;
  is_streaming?: boolean;
}

// Chat session types
export interface ChatSession {
  id: string;
  title: string;
  model_id: string;
  created_at: number;
  updated_at: number;
  messages: Message[];
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
