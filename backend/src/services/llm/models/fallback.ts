import { Model, ModelInfo, BaseModelProperties } from '../types';
import logger from '../../../utils/logger';

interface ModelCategory {
  size: 'small' | 'medium' | 'large';
  family: string;
  capabilities: string[];
}

interface FallbackConfig {
  maxAttempts: number;
  retryDelay: number;
  healthCheckTimeout: number;
}

export class ModelFallbackManager {
  private config: FallbackConfig;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      retryDelay: 1000,
      healthCheckTimeout: 5000,
      ...config
    };
  }

  /**
   * Categorize a model based on its characteristics
   */
  private categorizeModel(model: Model): ModelCategory {
    const size = this.determineModelSize(model);
    const family = this.extractModelFamily(model);
    const capabilities = this.determineCapabilities(model);

    return { size, family, capabilities };
  }

  /**
   * Determine model size category
   */
  private determineModelSize(model: Model): 'small' | 'medium' | 'large' {
    const parameterCount = model.info.parameters?.parameter_count;
    const contextLength = model.info.parameters?.context_length;

    if (parameterCount) {
      if (parameterCount >= 30e9) return 'large';
      if (parameterCount >= 7e9) return 'medium';
      return 'small';
    }

    // Fallback to context length if parameter count not available
    if (contextLength) {
      if (contextLength >= 16384) return 'large';
      if (contextLength >= 8192) return 'medium';
      return 'small';
    }

    // Default to medium if no size indicators available
    return 'medium';
  }

  /**
   * Extract model family from name or metadata
   */
  private extractModelFamily(model: Model): string {
    // Check explicit family in parameters
    if (model.info.parameters?.family) {
      return model.info.parameters.family.toLowerCase();
    }

    // Extract from model name
    const name = model.name.toLowerCase();
    const families = ['llama', 'mistral', 'falcon', 'phi', 'qwen', 'deepseek'];
    
    for (const family of families) {
      if (name.includes(family)) return family;
    }

    return 'unknown';
  }

  /**
   * Determine model capabilities based on name and metadata
   */
  private determineCapabilities(model: Model): string[] {
    const capabilities: string[] = ['general']; // All models have general capability
    const name = model.name.toLowerCase();

    // Add capabilities based on name indicators
    if (name.includes('code') || name.includes('coder')) {
      capabilities.push('coding');
    }
    if (name.includes('chat')) {
      capabilities.push('chat');
    }
    if (name.includes('math') || name.includes('quantitative')) {
      capabilities.push('math');
    }

    // Add capabilities from model metadata if available
    if (model.info.parameters?.capabilities) {
      capabilities.push(...model.info.parameters.capabilities);
    }

    return [...new Set(capabilities)]; // Remove duplicates
  }

  /**
   * Calculate similarity score between two model categories
   */
  private calculateSimilarityScore(
    category: ModelCategory,
    primaryCategory: ModelCategory
  ): number {
    let score = 0;

    // Family match is highest priority
    if (category.family === primaryCategory.family) {
      score += 100;
    }

    // Size similarity
    const sizeMap = { small: 0, medium: 1, large: 2 };
    const sizeDiff = Math.abs(
      sizeMap[category.size] - sizeMap[primaryCategory.size]
    );
    score += (2 - sizeDiff) * 50;

    // Capability overlap
    const sharedCapabilities = category.capabilities.filter(cap =>
      primaryCategory.capabilities.includes(cap)
    ).length;
    score += sharedCapabilities * 25;

    return score;
  }

  /**
   * Generate fallback chain for a model
   */
  async generateFallbackChain(
    primaryModel: Model,
    availableModels: Model[]
  ): Promise<Model[]> {
    const primaryCategory = this.categorizeModel(primaryModel);
    const fallbackChain: Model[] = [primaryModel];
    
    // Categorize all available models
    const categorizedModels = availableModels
      .filter(m => m.modelId !== primaryModel.modelId) // Exclude primary model
      .map(model => ({
        model,
        category: this.categorizeModel(model)
      }));

    // Sort models by similarity to primary model
    const sortedModels = this.sortModelsBySimilarity(
      categorizedModels,
      primaryCategory
    );

    // Add to fallback chain
    fallbackChain.push(...sortedModels.map(m => m.model));

    return fallbackChain;
  }

  /**
   * Sort models by similarity to primary model
   */
  private sortModelsBySimilarity(
    models: Array<{ model: Model; category: ModelCategory }>,
    primaryCategory: ModelCategory
  ): Array<{ model: Model; category: ModelCategory }> {
    return models.sort((a, b) => {
      const scoreA = this.calculateSimilarityScore(a.category, primaryCategory);
      const scoreB = this.calculateSimilarityScore(b.category, primaryCategory);
      return scoreB - scoreA;
    });
  }

  /**
   * Check model health before using
   */
  async checkModelHealth(model: Model): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.healthCheckTimeout);

      // Simple health check - just verify if model is available
      const isAvailable = model.info.status?.isAvailable ?? true;

      // Update last health check timestamp
      model.info.status = {
        isAvailable,
        lastHealthCheck: Date.now(),
        ...(model.info.status || {})
      };

      clearTimeout(timeoutId);
      return isAvailable;
    } catch (error) {
      logger.warn(`Health check failed for model ${model.modelId}:`, error);
      return false;
    }
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback<T>(
    primaryModel: Model,
    availableModels: Model[],
    operation: (model: Model) => Promise<T>
  ): Promise<T> {
    const fallbackChain = await this.generateFallbackChain(
      primaryModel,
      availableModels
    );

    let lastError: Error | null = null;
    
    for (const model of fallbackChain) {
      try {
        // Check model health before attempting
        const isHealthy = await this.checkModelHealth(model);
        if (!isHealthy) {
          logger.warn(`Model ${model.modelId} not available, trying next fallback`);
          continue;
        }

        // Update usage count in metadata
        model.metadata = {
          ...model.metadata,
          usageCount: (model.metadata?.usageCount || 0) + 1,
          lastUpdated: Date.now()
        };

        // Attempt operation with current model
        const result = await operation(model);

        // Update model status on success
        model.info.status = {
          isAvailable: true,
          lastHealthCheck: Date.now(),
          ...(model.info.status || {})
        };

        return result;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Operation failed with model ${model.modelId}:`, error);
        
        // Update model status on failure
        model.info.status = {
          isAvailable: false,
          lastHealthCheck: Date.now(),
          ...(model.info.status || {})
        };

        // Wait before trying next model
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }

    // If we get here, all fallbacks failed
    throw new Error(
      `All models in fallback chain failed. Last error: ${lastError?.message}`
    );
  }
} 