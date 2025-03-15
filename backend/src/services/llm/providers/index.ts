import { BaseModelProvider, ModelConfig } from '../types';
import { OllamaProvider } from './ollama';

export class ModelProviderFactory {
  private static providers: Map<string, BaseModelProvider> = new Map();

  static getProvider(config: ModelConfig): BaseModelProvider {
    const provider = config.provider.toLowerCase();

    if (!this.providers.has(provider)) {
      switch (provider) {
        case 'ollama':
          this.providers.set(provider, new OllamaProvider());
          break;
        // Add more providers here as needed
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    }

    return this.providers.get(provider)!;
  }

  // For testing and cleanup
  static clearProviders(): void {
    this.providers.clear();
  }
} 