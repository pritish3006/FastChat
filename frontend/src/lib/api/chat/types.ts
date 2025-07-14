import { BackendResponse, StreamChunk as BaseStreamChunk } from '../types';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  metadata?: {
    isError?: boolean;
    useSearch?: boolean;
    useTTS?: boolean;
    useSTT?: boolean;
    modelId?: string;
    isAgent?: boolean;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  modelId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages: ChatMessage[];
  userId?: string | null;
}

export interface ChatConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  useStream?: boolean;
}

export interface ChatEndpointConfig {
  endpoint: 'chat' | 'agent';
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  useStream?: boolean;
  useVoice?: boolean;
  tools?: {
    enabled: boolean;
    tools?: string[];
  };
}

export interface SendMessageRequest {
  content: string;
  sessionId: string;
  config: ChatEndpointConfig;
}

export interface SendMessageResponse {
  messages: ChatMessage[];
}

export interface StreamChunkData {
  type: 'metadata' | 'content' | 'done' | 'error';
  content?: string;
  messageId?: string;
  sessionId?: string;
  error?: string;
  toolResults?: {
    response?: string;
    summary?: string;
    search?: any[];
    steps?: any[];
  };
}

export type ChatStreamChunk = BaseStreamChunk<StreamChunkData>;

export interface RegenerateRequest {
  messageId: string;
  sessionId: string;
}

export interface ChatHistoryRequest {
  sessionId: string;
  limit?: number;
  before?: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
} 