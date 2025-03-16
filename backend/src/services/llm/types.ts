import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { WebSocket } from 'ws';

// Base model properties shared between config and runtime
export interface BaseModelProperties {
  provider: 'ollama' | 'openai' | 'anthropic';
  modelId: string;
  baseUrl?: string;
}

// Configuration interface - what users provide
export interface ModelConfig extends BaseModelProperties {
  temperature?: number;
  topP?: number;
  apiKey?: string;
}

// Runtime model information
export interface ModelInfo {
  contextWindow: number;
  parameters?: {
    parameter_count?: number;
    context_length?: number;
    family?: string;
    capabilities?: string[];
  };
  status?: {
    isAvailable: boolean;
    lastHealthCheck: number;
    avgResponseTime?: number;
    errorRate?: number;
  };
}

// Full model representation for registry and fallback management
export interface Model extends BaseModelProperties {
  name: string;
  description?: string;
  config: Omit<ModelConfig, keyof BaseModelProperties>;  // Avoid duplication
  info: ModelInfo;
  metadata?: {
    tags?: string[];
    version?: string;
    lastUpdated?: number;
    usageCount?: number;
  };
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
    mergedFrom?: string;      // ID of the source branch when this message came from a merge
  };
} 