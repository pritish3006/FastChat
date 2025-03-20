/**
 * LLM Service
 * 
 * Core service that integrates model providers, memory management, and streaming
 * for a comprehensive LLM interaction system.
 */

// @ts-nocheck
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { MemoryManager } from './memory';
import { StreamingManager } from './streaming';
import { BaseProvider } from './providers/base';
import { OpenAIProvider } from './providers/openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  ChatParams,
  ChatResponse,
  Message,
  ModelConfig,
  Session,
  StreamCallbacks,
  StreamChunk,
  StreamOptions,
  StreamSession,
  LLMServiceConfig,
  Context
} from './types';
import { ApiError } from '../../middleware/errorHandler';
import { config } from '../../config/index';
import { ollamaService, StreamController } from './ollama';
import { eventEmitterToAsyncIterable } from './utils';

// Import core components
import { ModelProviderFactory } from './providers';
import { BranchManager } from './memory/branch';
import type { Branch, BranchHistoryEntry } from './memory/branch';
import { RedisManager } from './memory/redis';
import { DEFAULT_MEMORY_CONFIG } from './memory/config';
import { RedisMemory } from './memory/redis';

/**
 * Error class specific to LLM Service errors
 */
export class LLMServiceError extends Error {
  public readonly code: string;
  
  constructor(message: string, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'LLMServiceError';
    this.code = code;
    
    // Correctly sets the prototype chain for instanceof checks
    Object.setPrototypeOf(this, LLMServiceError.prototype);
  }
}

// Local types for internal use
interface InternalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/**
 * Main LLM Service class that coordinates model providers, memory, and streaming
 */
export class LLMService {
  private config: LLMServiceConfig;
  private model: BaseProvider | null = null;
  private redisMemory: RedisMemory | null = null;
  private streamingManager: StreamingManager;
  private initialized: boolean = false;
  private emitter: EventEmitter = new EventEmitter();

  /**
   * Create a new LLM service
   */
  constructor(config: LLMServiceConfig) {
    this.config = config;
    this.streamingManager = new StreamingManager();
    
    // Initialize Redis memory if config provided
    if (config.memory?.redis?.enabled) {
      this.redisMemory = new RedisMemory(config.memory.redis);
    }
    
    logger.info('LLM service created with configuration', {
      modelProvider: config.model.provider,
      modelId: config.model.modelId,
      hasMemoryConfig: !!config.memory
    });
  }

  /**
   * Initialize the service and all its components
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      logger.info('LLM service already initialized');
      return true;
    }

    try {
      logger.info('Initializing LLM service...');

      // Initialize Redis memory if available
      if (this.redisMemory) {
        try {
          logger.info('Initializing Redis memory...');
          await this.redisMemory.initialize();
          logger.info('Redis memory initialized successfully');
        } catch (error) {
          logger.error('Failed to initialize Redis memory:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : 'No stack trace available'
          });
          throw new LLMServiceError('Failed to initialize Redis memory', 'REDIS_INIT_ERROR');
        }
      }

      // Initialize streaming manager
      try {
        logger.info('Initializing streaming manager...');
        await this.streamingManager.initialize();
        logger.info('Streaming manager initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize streaming manager:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace available'
        });
        throw new LLMServiceError('Failed to initialize streaming manager', 'STREAMING_INIT_ERROR');
      }

      // Initialize model provider
      try {
        logger.info('Initializing model provider...');
        const provider = this.config.model.provider;
        const modelProviderFactory = ModelProviderFactory;
        this.model = modelProviderFactory.getProvider(this.config.model);
        
        await this.model.initialize();
        logger.info(`Model provider (${provider}) initialized successfully`);
      } catch (error) {
        logger.error('Failed to initialize model provider:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace available',
          provider: this.config.model.provider,
          modelId: this.config.model.modelId
        });
        throw new LLMServiceError('Failed to initialize model provider', 'MODEL_INIT_ERROR');
      }

      this.initialized = true;
      logger.info('LLM service initialized successfully');
      return true;
    } catch (error) {
      // Don't log 'Failed to initialize LLM service' here as we already logged specific errors
      if (!(error instanceof LLMServiceError)) {
        logger.error('Unexpected error during LLM service initialization:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace available'
        });
      }
      return false;
    }
  }

  /**
   * List available models from the provider
   */
  async listModels() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.model) {
      throw new Error('Model provider not initialized');
    }
    
    try {
      // Get models from the current provider
      const models = await this.model.listModels();
      
      // Convert to generic model format
      return models.map(model => ({
        id: model.id,
        name: model.name,
        provider: this.config.model.provider,
        description: `Model ${model.name}`,
        parameters: {}
      }));
    } catch (error) {
      logger.error('Failed to list models', { error });
      throw new ApiError(502, 'Failed to fetch available models');
    }
  }

  /**
   * get or create a chat session
   */
  async getOrCreateSession(sessionId: string): Promise<Session> {
    if (!this.redisMemory) {
      throw new LLMServiceError('Memory not initialized', 'MEMORY_NOT_INITIALIZED');
    }

    // Try to get existing session
    const existingSession = await this.redisMemory.getSession(sessionId);
    if (existingSession) {
      // Update last accessed time
      const updatedSession = {
        ...existingSession,
        lastAccessedAt: Date.now()
      };
      await this.redisMemory.updateSession(sessionId, { lastAccessedAt: Date.now() });
      return updatedSession;
    }

    // Create new session
    const newSession: Session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      modelId: this.config.model.modelId
    };

    // Store new session
    await this.redisMemory.setSession(sessionId, newSession);
    return newSession;
  }

  /**
   * chat with the llm using a session
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    if (!this.model) {
      throw new LLMServiceError('Model not initialized', 'MODEL_NOT_INITIALIZED');
    }

    const { 
      sessionId, 
      message: userMessageContent, 
      branchId, 
      systemPrompt, 
      temperature,
      maxTokens, 
      callbacks,
      websocket
    } = params;

    // Get or create session
    await this.getOrCreateSession(sessionId);

    // Prepare user message
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: userMessageContent,
      createdAt: Date.now(),
      sessionId,
      branchId,
    };

    // Save user message to Redis
    await this.redisMemory?.storeMessage(userMessage);

    // Get conversation context from Redis
    const context = await this.buildChatContext(sessionId, branchId);

    let streamSession: StreamSession | undefined;
    let assistantMessageContent = '';
    let assistantMessage: Message;

    try {
      // Set up streaming session for real-time updates
      if (callbacks?.onToken || websocket) {
        // Set up streaming through the streaming manager
        streamSession = await this.streamingManager.streamResponse(
          uuidv4(), // Connection ID
          sessionId,
          'pending', // Will be replaced with the actual message ID after generation
          this.model.streamChatCompletion(
            context.messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            {
              temperature: temperature || this.config.model.temperature,
              maxTokens: maxTokens || this.config.model.maxTokens
            },
            {
              onToken: callbacks?.onToken,
              onComplete: callbacks?.onComplete,
              onError: callbacks?.onError,
              websocket
            }
          ),
          {
            onToken: callbacks?.onToken,
            onComplete: callbacks?.onComplete,
            onError: callbacks?.onError,
            websocket
          }
        );

        // Get content from streaming session when complete
        assistantMessageContent = await this.waitForStreamCompletion(streamSession.id);
      } else {
        // Non-streaming mode
        const completion = await this.model.generateText({
          messages: context.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          systemPrompt: systemPrompt || context.systemPrompt,
          temperature: temperature || this.config.model.temperature,
          maxTokens: maxTokens || this.config.model.maxTokens
        });

        assistantMessageContent = completion.content;
      }

      // Create assistant message
      assistantMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: assistantMessageContent,
        createdAt: Date.now(),
        sessionId,
        branchId,
      };

      // Save assistant message to Redis
      await this.redisMemory?.storeMessage(assistantMessage);

      // Update stream session with the actual message ID if streaming was used
      if (streamSession) {
        // Just a placeholder for now
      }

      return {
        message: assistantMessageContent,
        sessionId,
        messageId: assistantMessage.id,
        metadata: {
          tokenUsage: {
            prompt: 0, // These would be set to actual values in a production environment
            completion: 0,
            total: 0
          },
          model: this.config.model.modelId,
          streamProgress: streamSession ? {
            tokensReceived: streamSession.tokensReceived,
            duration: streamSession.duration,
            status: streamSession.status === 'done' ? 'complete' : streamSession.status
          } : {
            tokensReceived: 0,
            duration: 0,
            status: 'complete'
          }
        }
      };
    } catch (error) {
      logger.error('Error in chat:', error);
      throw new LLMServiceError(
        `Failed to generate response: ${error instanceof Error ? error.message : String(error)}`,
        'GENERATION_FAILED'
      );
    }
  }

  /**
   * Get token usage statistics for a session
   */
  async getSessionTokenUsage(sessionId: string): Promise<{ 
    prompt: number; 
    completion: number; 
    total: number; 
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Simplified token usage stats based on character count
    try {
      const messages = await this.redisMemory!.getMessages(sessionId);
      let promptTokens = 0;
      let completionTokens = 0;
      
      for (const message of messages) {
        const tokens = Math.ceil(message.content.length / 4); // Simple approximation
        
        if (message.role === 'user' || message.role === 'system') {
          promptTokens += tokens;
        } else if (message.role === 'assistant') {
          completionTokens += tokens;
        }
      }
      
      return {
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens
      };
    } catch (error) {
      logger.error(`Error getting token usage for session ${sessionId}:`, error);
      return { prompt: 0, completion: 0, total: 0 };
    }
  }

  /**
   * Find messages similar to a query - currently not supported without vector store
   */
  async findSimilarMessages(
    sessionId: string,
    query: string,
    options: {
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<Message[]> {
    logger.warn('findSimilarMessages called but vector store is not configured');
    return [];
  }

  /**
   * shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down LLM service');
      
      // Cleanup providers
      if (this.model) {
        try {
          await this.model.cleanup();
        } catch (error) {
          logger.error('Error cleaning up model provider:', error);
        }
      }
      
      // No explicit cleanup needed for StreamingManager
      
      // Cleanup Redis connections
      if (this.redisMemory) {
        try {
          // RedisMemory doesn't have a cleanup method in the updated interface
          // If we need to add one, we should update the interface
        } catch (error) {
          logger.error('Error cleaning up Redis memory:', error);
        }
      }
      
      logger.info('LLM service shutdown complete');
    } catch (error) {
      logger.error('Error during LLM service shutdown:', error);
      throw error;
    }
  }

  /**
   * Set model for a session
   */
  async setModel(sessionId: string, modelId: string): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }

    const session = await this.getOrCreateSession(sessionId);
    
    // Validate model exists
    const models = await this.listModels();
    const modelExists = models.some(m => m.id === modelId);
    if (!modelExists) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Update session
    session.modelId = modelId;
    session.lastAccessedAt = Date.now();
    
    // Store in Redis
    await this.redisMemory!.setSession(sessionId, session);
    
    logger.info('Session model updated', {
      sessionId,
      modelId
    });

    return session;
  }

  /**
   * Update model configuration for a session
   */
  async updateModelConfig(
    sessionId: string,
    config: Partial<Omit<ModelConfig, 'provider' | 'modelId' | 'baseURL'>>
  ): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }

    const session = await this.getOrCreateSession(sessionId);
    
    // Validate config
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
      throw new Error('Temperature must be between 0 and 1');
    }
    if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
      throw new Error('Top P must be between 0 and 1');
    }

    // Update session
    if (!session.modelConfig) {
      session.modelConfig = {
        provider: this.config.model.provider,
        modelId: session.modelId || this.config.model.modelId, // Handle undefined case
        baseURL: this.config.model.baseURL,
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        maxTokens: config.maxTokens
      };
    } else {
      session.modelConfig = {
        ...session.modelConfig,
        temperature: config.temperature ?? session.modelConfig.temperature,
        topP: config.topP ?? session.modelConfig.topP,
        topK: config.topK ?? session.modelConfig.topK,
        maxTokens: config.maxTokens ?? session.modelConfig.maxTokens
      };
    }
    session.lastAccessedAt = Date.now();
    
    // Store in Redis
    await this.redisMemory!.updateSession(sessionId, session);
    
    logger.info('Session model config updated', {
      sessionId,
      config: session.modelConfig
    });

    return session;
  }

  /**
   * converts an array of messages to a prompt string for non-chat models
   */
  messagesToPrompt(messages: InternalChatMessage[]): string {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        return `User: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}\n\n`;
      }
      return '';
    }).join('') + 'Assistant: ';
  }

  /**
   * Calculate approximate token usage for a conversation
   */
  private calculateTokenUsage(prompt: string, completion: string): { prompt: number; completion: number; total: number } {
    // This is a simple approximation - in a real implementation, use a proper tokenizer
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(completion.length / 4);
    
    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    };
  }

  /**
   * Ensure the service is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.model) {
      throw new Error('LLM service not initialized');
    }
  }

  /**
   * Builds a chat context from session messages
   */
  async buildChatContext(sessionId: string, branchId?: string): Promise<Context> {
    if (!this.redisMemory) {
      return {
        messages: [],
        metadata: {
          sessionId,
          tokenCount: 0,
          messageCount: 0
        }
      };
    }

    // Get messages from Redis
    const messages = await this.redisMemory.getMessages(sessionId, branchId);
    
    // Sort messages by creation time
    const sortedMessages = [...messages].sort((a, b) => a.createdAt - b.createdAt);
    
    // Calculate approximate token count (simple estimation)
    const tokenCount = sortedMessages.reduce((sum, msg) => 
      sum + Math.ceil(msg.content.length / 4), 0);
    
    return {
      messages: sortedMessages,
      metadata: {
        sessionId,
        tokenCount,
        messageCount: sortedMessages.length
      }
    };
  }

  /**
   * Wait for stream completion
   */
  private async waitForStreamCompletion(streamId: string): Promise<string> {
    // Implementation of waitForStreamCompletion method
    throw new Error('Method not implemented');
  }
}

// Export a factory function for simpler instantiation
export function createLLMService(config: LLMServiceConfig): LLMService {
  // Merge with default configuration for memory
  const mergedConfig: LLMServiceConfig = {
    ...config,
    memory: config.memory || {
      redis: DEFAULT_MEMORY_CONFIG.redis,
      database: DEFAULT_MEMORY_CONFIG.database,
      defaults: DEFAULT_MEMORY_CONFIG.defaults
    }
  };
  
  return new LLMService(mergedConfig);
}

// Re-export types for ease of use
export type {
  ChatParams,
  ChatResponse,
  LLMServiceConfig,
  ModelConfig,
  Session,
  Message,
  Context,
  Branch
} from './types';

// Re-export component factories for direct access
export { ModelProviderFactory } from './providers';
export { createMemoryManager } from './memory';

// generic model interface for any provider
export interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  maxTokens?: number;
  parameters?: Record<string, any>;
}

// request interface for llm completions
export interface CompletionRequest {
  prompt: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  user?: string;
  context?: any;
}

// Use the ChatMessage type from ./types instead
// llm service implementation

export const llmService = {
  // cached models list
  modelCache: null as Model[] | null,
  modelCacheExpiry: 0,
  
  /**
   * lists available models from all configured providers
   */
  async listModels(): Promise<Model[]> {
    try {
      // use cache if available and not expired (5 minutes)
      const now = Date.now();
      if (this.modelCache && this.modelCacheExpiry > now) {
        return this.modelCache;
      }
      
      // fetch models from ollama
      const ollamaModels = await ollamaService.listModels();
      
      // convert to generic model format
      const models: Model[] = ollamaModels.map(model => ({
        id: model.name,
        name: model.name,
        provider: 'ollama',
        description: `${model.details.family} (${model.details.parameter_size})`,
        parameters: {
          ...model.details
        }
      }));
      
      // add default model if it doesn't exist in models list
      const defaultModel = config.llm.defaultModel;
      if (defaultModel && !models.find(m => m.id === defaultModel)) {
        models.push({
          id: defaultModel,
          name: defaultModel,
          provider: 'ollama',
          description: 'Default model'
        });
      }
      
      // update cache
      this.modelCache = models;
      this.modelCacheExpiry = now + 5 * 60 * 1000; // 5 minutes
      
      return models;
    } catch (error) {
      logger.error('error fetching models', { error });
      throw new ApiError(502, 'failed to fetch available models');
    }
  },
  
  /**
   * get a specific model by id
   */
  async getModel(modelId: string): Promise<Model | null> {
    try {
      const models = await this.listModels();
      return models.find(model => model.id === modelId) || null;
    } catch (error) {
      logger.error('error fetching model', { error, modelId });
      return null;
    }
  },
  
  /**
   * generates a completion using the specified model with streaming
   * returns an event emitter that forwards events from the provider
   */
  async generateCompletion(
    request: CompletionRequest
  ): Promise<StreamController> {
    try {
      // find the model to determine provider
      const model = await this.getModel(request.model);
      
      if (!model) {
        const emitter = new EventEmitter() as StreamController;
        emitter.abort = () => {}; // dummy abort function
        emitter.emit('error', new ApiError(400, `model ${request.model} not found`));
        return emitter;
      }
      
      // Create a provider for this model
      const provider = new OpenAIProvider({
        provider: model.provider as any,
        modelId: model.id,
        apiKey: process.env.OPENAI_API_KEY
      });
      
      await provider.initialize();
      
      // Generate completion using the provider
      const result = await provider.generateChatCompletion({
        messages: [{ role: 'user', content: request.prompt }],
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        topP: request.topP,
        stream: true
      });
      
      // Make sure we're returning a StreamController
      if (!('abort' in result)) {
        const emitter = new EventEmitter() as StreamController;
        emitter.abort = () => {}; // dummy abort function
        emitter.emit('error', new Error('Expected streaming response but got text response'));
        return emitter;
      }
      
      return result;
    } catch (error) {
      logger.error('error generating completion', { error });
      throw new ApiError(500, 'failed to generate completion');
    }
  }
};