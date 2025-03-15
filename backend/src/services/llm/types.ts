import { BaseChatModel } from '@langchain/core/language_models/chat_models';

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
      config: Record<string, any>;
    };
  };
}

export interface ChatParams {
  sessionId: string;
  message: string;
  chainType?: 'conversation' | 'rag';
  systemPrompt?: string;
  callbacks?: StreamCallbacks;
}

export interface ChatResponse {
  text: string;
  sourceDocuments?: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
  metadata?: Record<string, any>;
}

export interface BaseModelProvider {
  initialize(config: ModelConfig): Promise<BaseChatModel>;
  validateConfig(config: ModelConfig): void;
} 