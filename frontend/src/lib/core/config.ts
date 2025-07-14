/**
 * Configuration management for the application
 */

export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  chat: {
    defaultModel: string;
    streamingEnabled: boolean;
    defaultTemperature: number;
    maxTokens: number;
  };
  sse: {
    retryInterval: number;
    maxRetryAttempts: number;
    eventSourceTimeout: number;
  };
}

// Default configuration
const defaultConfig: AppConfig = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    timeout: 30000,
    retryAttempts: 3,
  },
  chat: {
    defaultModel: 'gpt-3.5-turbo',
    streamingEnabled: true,
    defaultTemperature: 0.7,
    maxTokens: 2000,
  },
  sse: {
    retryInterval: 1000,
    maxRetryAttempts: 3,
    eventSourceTimeout: 30000,
  },
};

class ConfigService {
  private config: AppConfig;

  constructor(customConfig: Partial<AppConfig> = {}) {
    this.config = this.mergeConfig(defaultConfig, customConfig);
  }

  private mergeConfig(default_: AppConfig, custom: Partial<AppConfig>): AppConfig {
    return {
      api: { ...default_.api, ...custom.api },
      chat: { ...default_.chat, ...custom.chat },
      sse: { ...default_.sse, ...custom.sse },
    };
  }

  get(): AppConfig {
    return this.config;
  }

  update(newConfig: Partial<AppConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig);
  }

  getApiConfig() {
    return this.config.api;
  }

  getChatConfig() {
    return this.config.chat;
  }

  getSSEConfig() {
    return this.config.sse;
  }
}

// Export a singleton instance
export const configService = new ConfigService(); 