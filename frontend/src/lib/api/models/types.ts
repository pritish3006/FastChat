import { BackendResponse } from '../types';

export interface Model {
  id: string;
  name: string;
  contextLength: number;
  provider?: string;
  description?: string;
}

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

export interface GetModelsResponse {
  success: boolean;
  models: Model[];
}

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

export interface GetModelConfigResponse extends BackendResponse<{
  config: ModelConfig;
}> {}

export interface UpdateModelConfigRequest {
  modelId: string;
  config: Partial<ModelConfig>;
}

export interface UpdateModelConfigResponse extends BackendResponse<{
  config: ModelConfig;
}> {} 