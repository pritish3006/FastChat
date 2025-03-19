import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Document } from '@langchain/core/documents';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

// Stream controller for handling event-based streaming responses
export interface StreamController extends EventEmitter {
  abort: () => void;
}

// Base model properties shared between config and runtime
export interface BaseModelProperties {
  provider: 'ollama' | 'openai' | 'anthropic' | 'langchain';
  modelId: string;
  baseUrl?: string;
}

// Configuration interface - what users provide
export interface ModelConfig extends BaseModelProperties {
  temperature?: number;
  topP?: number;
  apiKey?: string;
  topK?: number;
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

export interface PersistenceConfig {
  enabled: boolean;
  persistImmediately: boolean;
  maxRedisAge: number;
  batchSize: number;
  cleanupInterval: number;
}

export interface LangChainMemoryConfig {
  enabled: boolean;
  memory?: {
    useLangChainMemory: boolean;
    maxTokens?: number;
    maxMessages?: number;
    summarizeAfter?: number;
  };
  model?: BaseChatModel;
}

export interface MemoryConfig {
  redis: {
    enabled: boolean;
    url: string;
    prefix?: string;
    sessionTTL: number;
  };
  database: {
    type: 'supabase' | 'postgres';
    url: string;
    key: string;
    enabled: boolean;
  };
  vector?: {
    enabled: boolean;
    type?: 'supabase';
    supabaseUrl: string;
    supabaseKey: string;
    tableName?: string;
  };
  persistence?: PersistenceConfig;
  langchain?: LangChainMemoryConfig;
  defaults: {
    maxContextSize: number;
    sessionTTL: number;
    maxMessageSize: number;
  };
}

export interface LangChainConfig {
  enabled: boolean;
  memory?: {
    useLangChainMemory: boolean;
    maxTokens?: number;
    maxMessages?: number;
    summarizeAfter?: number;
    tieredCaching?: boolean;
  };
  chains?: {
    useLangChainChains: boolean;
    defaultChain?: 'conversation' | 'rag' | 'router';
  };
  tokenTracking?: {
    enabled: boolean;
    storeUsageStats?: boolean;
  };
}

export interface LLMServiceConfig {
  model: ModelConfig;
  memory?: MemoryConfig;
  defaultParams?: {
    temperature: number;
    maxTokens: number;
  };
  // Better structured LangChain configuration
  langchain?: LangChainConfig;
  supabaseClient?: any; // Added for database operations
}

export interface ChatParams {
  sessionId?: string;        // Optional: Will create new session if not provided
  message: string;
  branchId?: string;        // Optional: For branched conversations
  parentMessageId?: string;  // Optional: For threaded responses
  systemPrompt?: string;
  chainType?: 'conversation' | 'rag' | 'router';
  callbacks?: StreamCallbacks;
  websocket?: WebSocket;     // Optional: For streaming responses
  signal?: AbortSignal;      // Optional: For cancelling requests
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
  generateChatCompletion(params: {
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    signal?: AbortSignal;
  }): Promise<{ text: string } | StreamController>;
  modelId?: string;
  asLangChainModel(options?: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
  }): BaseChatModel;
}

// Session Management
export interface Session {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  messageCount: number;
  branches: string[];  // Array of branch IDs
  modelId: string;
  modelConfig?: ModelConfig;
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
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  version: number;
  branchId?: string;
  parentId?: string;
  metadata?: {
    tokens?: number;
    embedding?: number[];
    edited?: boolean;
    originalContent?: string;
    originalMessageId?: string;
    model?: string;
    persistedAt?: number;
    similarity?: number;
    mergedFrom?: string;
    userId?: string;
    parentId?: string;
    source?: string;
    [key: string]: any; // Allow additional metadata properties
  };
}

// LangChain specific types
export interface LangChainMemoryVariable {
  history: Array<any>; // LangChain message types
  additionalKwargs?: {
    source: 'memory_cache' | 'redis' | 'vector_store';
  };
}

export interface ChainInput {
  question: string;
  history?: Array<any>;
  context?: string;
  systemPrompt?: string;
}

export interface ChainOutput {
  text: string;
  sourceDocuments?: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface Branch {
  id: string;
  sessionId: string;
  parentBranchId?: string;
  name: string;
  description?: string;
  parentMessageId?: string;
  isMainBranch?: boolean;
  isActive?: boolean;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  branchMarker?: string;
  branchOrder?: number;
  colorHex?: string;
  branchType?: string;
} 