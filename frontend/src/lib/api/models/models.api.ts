import { BaseAPIClient } from '../base';
import { APIConfig } from '../types';
import {
  Model,
  GetModelsResponse,
  GetModelConfigResponse,
  UpdateModelConfigRequest,
  UpdateModelConfigResponse,
} from './types';
import { mockResponses } from './mock';

// Flag to control mock mode
const USE_MOCKS = import.meta.env.VITE_ENABLE_MOCK_API === 'true';

// API version prefix
const API_PREFIX = 'api/v1';

export class ModelsAPI extends BaseAPIClient {
  constructor(config: APIConfig) {
    super(config);
  }

  /**
   * Get available models
   */
  async getModels(): Promise<Model[]> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockResponses.getModels();
    }

    const response = await this.get<{ success: boolean; models: Model[] }>(`${API_PREFIX}/models`);
    return response.models;
  }

  /**
   * Get model configuration
   */
  async getModelConfig(modelId: string): Promise<GetModelConfigResponse> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockResponses.getModelConfig();
    }

    return this.get<GetModelConfigResponse>(`${API_PREFIX}/models/${modelId}/config`);
  }

  /**
   * Update model configuration
   */
  async updateModelConfig(request: UpdateModelConfigRequest): Promise<UpdateModelConfigResponse> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockResponses.updateModelConfig();
    }

    return this.put<UpdateModelConfigResponse>(
      `${API_PREFIX}/models/${request.modelId}/config`,
      request.config
    );
  }
}

// Create and export a singleton instance
export const modelsAPI = new ModelsAPI({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryAttempts: 3,
}); 