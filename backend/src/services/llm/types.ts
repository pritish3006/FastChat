import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { WebSocket } from 'ws';

export interface ModelConfig {
  provider: 'ollama' | 'openai' | 'anthropic';  // extensible for future providers
  modelId: string;
  baseUrl?: string;
  temperature?: number;
  topP?: number;
  apiKey?: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onStart?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface LLMServiceConfig {
  model: ModelConfig;
  memory?: {
    redisUrl?: string;
    sessionTTL?: number;
    vectorStore?: {
      type: 'supabase';
      supabaseUrl: string;
      supabaseKey: string;
      tableName?: string;
      embeddingModel?: string;
      config?: Record<string, any>;
    };
  };
}

export interface ChatParams {
  sessionId?: string;        // Optional: Will create new session if not provided
  message: string;
  branchId?: string;        // Optional: For branched conversations
  parentMessageId?: string;  // Optional: For threaded responses
  systemPrompt?: string;
  chainType?: 'conversation' | 'rag';
  callbacks?: StreamCallbacks;
  websocket?: WebSocket;     // Optional: For streaming responses
}

export interface ChatResponse {
  text: string;
  sessionId: string;        // Always return sessionId for tracking
  messageId: string;        // Unique ID for the generated message
  branchId?: string;       // If part of a branch
  sourceDocuments?: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
  metadata?: {
    model: string;
    provider: string;
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    branchInfo?: {
      depth: number;
      parentMessageId?: string;
    };
  };
}

export interface BaseModelProvider {
  initialize(config: ModelConfig): Promise<BaseChatModel>;
  validateConfig(config: ModelConfig): void;
  generateStream?(params: ChatParams): AsyncIterator<any>;
}

// Session Management
export interface Session {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  messageCount: number;
  branches: string[];
  metadata?: Record<string, any>;
}

// Context Management
export interface Context {
  messages: Message[];
  systemPrompt?: string;
  metadata: {
    sessionId: string;
    branchId?: string;
    tokenCount: number;
    messageCount: number;
  };
}

// Message Structure
export interface Message {
  id: string;
  sessionId: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
  timestamp: number;
  branchId?: string;
  parentMessageId?: string;   // Maps to parent_id in database
  version: number;
  metadata?: {
    tokens?: number;
    embedding?: number[];
    edited?: boolean;
    originalContent?: string;
    originalMessageId?: string;
    model?: string;           // Model used to generate this message
    persistedAt?: number;     // Timestamp when message was persisted to DB
    similarity?: number;      // For vector search results
  };
} 