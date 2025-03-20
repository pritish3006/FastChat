import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Document } from '@langchain/core/documents';
import { Socket } from 'socket.io';
import { EventEmitter } from 'events';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
export interface ModelConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'langchain';
  apiKey?: string;
  modelId: string;
  baseURL?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  systemPrompt?: string;
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

// Simple model interface for provider listings
export interface Model {
  id: string;
  name: string;
  contextLength: number;
  provider?: string;
  description?: string;
}

// Stream callbacks for real-time streaming responses
export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onMetadata?: (metadata: Record<string, unknown>) => void;
  websocket?: Socket;
}

// Redis memory persistence configuration
export interface PersistenceConfig {
  enabled: boolean;
  persistImmediately: boolean;
  maxRedisAge: number;
  batchSize: number;
  cleanupInterval: number;
}

// LangChain memory configuration
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

// Memory configuration
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

// LangChain configuration
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

// LLM service configuration
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

// Chat parameters
export interface ChatParams {
  sessionId: string;
  message: string;
  branchId?: string;
  parentMessageId?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  callbacks?: {
    onToken?: (token: string) => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;
  };
  websocket?: Socket;
}

// Chat response interface
export interface ChatResponse {
  message: string;
  sessionId: string;
  messageId: string;
  metadata: {
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    model: string;
    streamProgress: {
      tokensReceived: number;
      duration: number;
      status: 'streaming' | 'complete' | 'error';
    };
  };
}

// Completion options
export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stream?: boolean;
  stop?: string[];
  systemPrompt?: string;
}

// Session interface
export interface Session {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  messageCount: number;
  branches?: string[];  // Array of branch IDs
  modelId?: string;
  modelConfig?: ModelConfig;
}

// Context interface
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

// Message roles
export type MessageRole = 'user' | 'assistant' | 'system';

// Message interface
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  sessionId: string;
  branchId?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  version?: number;
}

// LangChain memory variable
export interface LangChainMemoryVariable {
  history: Array<any>; // LangChain message types
  additionalKwargs?: {
    source: 'memory_cache' | 'redis' | 'vector_store';
  };
}

// Chain input
export interface ChainInput {
  question: string;
  history?: Array<any>;
  context?: string;
  systemPrompt?: string;
}

// Chain output
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

// Branch interface
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
  originMessageId?: string;
  depth?: number;
  isArchived?: boolean;
}

// Branch history entry
export interface BranchHistoryEntry {
  timestamp: number;
  action: string;
  branchId: string;
  branchName: string;
  messageId?: string;
  metadata?: Record<string, any>;
}

// Stream chunk
export interface StreamChunk {
  type: 'token' | 'error' | 'complete';
  content?: string;
  error?: Error;
  metadata?: Record<string, unknown>;
}

// Stream options
export interface StreamOptions {
  maxDuration?: number;
  timeout?: number;
  retryAttempts?: number;
  rateLimitPerMinute?: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

// Stream session
export interface StreamSession {
  id: string;
  connectionId: string;
  sessionId: string;
  messageId: string;
  startTime: number;
  status: 'starting' | 'streaming' | 'done' | 'error' | 'cancelled' | 'timeout';
  tokensReceived: number;
  duration: number;
  content: string;
  error: string | null;
  metadata?: Record<string, unknown>;
}

// Stream adapter
export interface StreamAdapter {
  initialize(): Promise<void>;
  stream(input: string, options?: StreamOptions): AsyncIterator<StreamChunk>;
  cleanup(): Promise<void>;
}

// Chat completion parameters
export interface ChatCompletionParams {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
    content: string;
    name?: string;
  }>;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

// Redis config interface
export interface RedisConfig {
  enabled: boolean;
  url: string;
  prefix?: string;
  sessionTTL: number;
}

// Redis manager interface
export interface RedisManager {
  getSession(sessionId: string): Promise<Session | null>;
  setSession(sessionId: string, session: Session): Promise<void>;
  updateSession(sessionId: string, update: Partial<Session>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  
  getMessage(messageId: string): Promise<Message | null>;
  getMessages(sessionId: string, branchId?: string): Promise<Message[]>;
  storeMessage(message: Message): Promise<void>;
  updateMessage(messageId: string, update: Partial<Message>): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  
  initialize(): Promise<void>;
} 