/**
 * Core message type for chat interactions
 */
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number | string;
  sessionId: string;
  branchId?: string;
  timestamp?: number | string;
  metadata?: MessageMetadata;
  is_streaming?: boolean;
  is_error?: boolean;
  chat_id?: string;
  branch_point?: boolean;
  version?: number;
}

export interface MessageMetadata {
  summary?: string;
  search?: SearchResult[];
  steps?: string[];
  isError?: boolean;
  useSearch?: boolean;
  modelId?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  streamProgress?: {
    tokensReceived: number;
    duration: number;
    status: 'streaming' | 'complete' | 'error';
  };
}

export interface SearchResult {
  title: string;
  content: string;
  url?: string;
  score?: number;
}

/**
 * Represents a chat session with messages and branches
 */
export interface ChatSession {
  id: string;
  createdAt: string | number;
  updatedAt?: string | number;
  lastAccessedAt?: number;
  messageCount: number;
  branches?: string[];
  modelId?: string;
  title?: string;
  messages: Message[];
  lastMessage?: Message;
  activeBranchId?: string | null;
}

/**
 * Global chat state interface
 */
export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentModel: string;
  isGenerating: boolean;
  editingMessageId: string | null;
  activeBranchId: string | null;
  currentBranchIndex: number;
  error: string | null;
  lastSyncTimestamp: string | null;
  isSidebarOpen: boolean;
}

/**
 * Configuration options for chat model
 */
export interface ChatConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

/**
 * API response format for chat messages
 */
export interface ChatResponse {
  message: Message;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Streaming response chunk format
 */
export interface StreamChunk {
  type: 'token' | 'error' | 'complete' | 'tool_start' | 'tool_end';
  content?: string;
  error?: Error;
  metadata?: {
    tool?: string;
    status?: string;
    progress?: number;
  };
}

/**
 * Props for chat-related components
 */
export interface ChatComponentProps {
  input: string;
  isLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onWebSearch?: () => void;
  onStop?: () => void;
}

export interface StreamingChatResponse extends ChatResponse {
  isComplete: boolean;
  error?: string;
}

/**
 * Agent request format
 */
export interface AgentRequest {
  content: string;
  sessionId: string;
  modelId: string;
  metadata: {
    summary?: string;
    search?: SearchResult[];
    steps?: string[];
    isError?: boolean;
    useSearch?: boolean;
    modelId?: string;
  };
} 