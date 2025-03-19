/**
 * LLM Service
 * 
 * Core service that integrates model providers, memory management, and streaming
 * for a comprehensive LLM interaction system.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ApiError } from '../../middleware/errorHandler';
import { config } from '../../config/index';
import { ollamaService, StreamController } from './ollama';
import { eventEmitterToAsyncIterable } from './utils';

// Import core components
import { ModelProviderFactory } from './providers';
import { MemoryManager } from './memory';
import { BranchManager } from './memory/branch';
import { StreamingManager } from './streaming';
import type { Branch, BranchHistoryEntry } from './memory/branch';
import { RedisManager } from './memory/redis';
import { DEFAULT_MEMORY_CONFIG } from './memory/config';

// Import types
import {
  ChatParams,
  ChatResponse,
  LLMServiceConfig,
  ModelConfig,
  Session,
  Context,
  Message,
  StreamCallbacks
} from './types';

// Define ChatMessage interface locally to match what's used in the service
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

/**
 * Main LLM Service class that coordinates model providers, memory, and streaming
 */
export class LLMService {
  private config: LLMServiceConfig;
  private model: Awaited<ReturnType<typeof ModelProviderFactory.getProvider>> | null = null;
  private memoryManager: MemoryManager;
  private branchManager: BranchManager;
  private streamingManager: StreamingManager;
  private initialized: boolean = false;

  /**
   * Create a new LLM service
   */
  constructor(config: LLMServiceConfig) {
    this.config = config;
    
    // Create memory manager with proper configuration
    if (config.memory) {
      const memoryConfig = config.memory;
      
      // Configure memory system with Redis connection
      const redisConfig = {
        enabled: true,
        url: memoryConfig.redis?.url || 'redis://localhost:6379',
        prefix: memoryConfig.redis?.prefix || 'fast-chat:memory:',
        sessionTTL: memoryConfig.redis?.sessionTTL || 24 * 60 * 60
      };
      
      // Use default config values with overrides
      this.memoryManager = new MemoryManager({
        redis: redisConfig,
        defaults: DEFAULT_MEMORY_CONFIG.defaults,
        database: memoryConfig.database || DEFAULT_MEMORY_CONFIG.database
      });
    } else {
      // Default memory configuration if none provided
      this.memoryManager = new MemoryManager(DEFAULT_MEMORY_CONFIG);
    }
    
    // Get the RedisManager from the memoryManager
    const redisManager = this.memoryManager.getRedisManager();
    
    // Initialize branch manager with the RedisManager
    this.branchManager = new BranchManager(redisManager);

    // Initialize streaming manager
    this.streamingManager = new StreamingManager();
    
    logger.info('LLM service created with configuration', {
      modelProvider: config.model.provider,
      modelId: config.model.modelId,
      hasMemoryConfig: !!config.memory
    });
  }

  /**
   * Initialize the service and all its components
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize memory system first
      await this.memoryManager.initialize();
      logger.info('Memory system initialized');
      
      // Create model provider
      this.model = ModelProviderFactory.getProvider(this.config.model);
      
      // Initialize model provider
      await this.model.initialize(this.config.model);
      logger.info(`Model provider ${this.config.model.provider} initialized`);
      
      this.initialized = true;
      logger.info('LLM service fully initialized');
    } catch (error) {
      logger.error('Failed to initialize LLM service:', error);
      throw new Error(`LLM service initialization failed: ${error}`);
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
    
    // The official way to get models is to call the ollamaService directly
    // since the provider might not have a listModels method
    return ollamaService.listModels(this.config.model.baseUrl);
  }

  /**
   * Start a new session for conversation
   */
  async startSession(): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const sessionId = uuidv4();
    const session: Session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
      modelId: this.config.model.modelId,
      modelConfig: {
        provider: this.config.model.provider,
        modelId: this.config.model.modelId,
        baseUrl: this.config.model.baseUrl
      }
    };
    
    // Create the session in redis
    await this.memoryManager.getRedisManager().setSession(session);
    
    logger.info(`New session started: ${sessionId}`);
    return session;
  }

  /**
   * Get existing session or create a new one
   */
  async getOrCreateSession(sessionId?: string): Promise<Session> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!sessionId) {
      return this.startSession();
    }
    
    try {
      const session = await this.memoryManager.getRedisManager().getSession(sessionId);
      if (session) {
        // Update last accessed time
        session.lastAccessedAt = Date.now();
        await this.memoryManager.getRedisManager().updateSession(sessionId, session);
        return session;
      }
    } catch (error) {
      logger.error(`Error retrieving session ${sessionId}:`, error);
    }
    
    // Session not found or error, create new
    return this.startSession();
  }

  /**
   * Create a new conversation branch
   */
  async createBranch(
    sessionId: string, 
    originMessageId: string, 
    options: { name?: string; metadata?: Record<string, any> } = {}
  ): Promise<Branch> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.createBranch(sessionId, originMessageId, options);
  }

  /**
   * Get all branches for a session
   */
  async getBranches(sessionId: string, includeArchived: boolean = false): Promise<Branch[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.getBranches(sessionId, includeArchived);
  }

  /**
   * Get a specific branch by ID
   */
  async getBranch(branchId: string): Promise<Branch | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.getBranch(branchId);
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(sessionId: string, branchId: string): Promise<Branch> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.switchBranch(sessionId, branchId);
  }

  /**
   * Merge one branch into another
   */
  async mergeBranches(
    sessionId: string, 
    sourceBranchId: string, 
    targetBranchId: string
  ): Promise<Branch> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.mergeBranches(sessionId, sourceBranchId, targetBranchId);
  }

  /**
   * Archive a branch
   */
  async archiveBranch(sessionId: string, branchId: string): Promise<Branch> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.archiveBranch(sessionId, branchId);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(
    sessionId: string, 
    branchId: string, 
    options: { deleteMessages?: boolean } = {}
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.deleteBranch(sessionId, branchId, options);
  }

  /**
   * Get branch history for a session
   */
  async getBranchHistory(sessionId: string): Promise<BranchHistoryEntry[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.getBranchHistory(sessionId);
  }

  /**
   * Edit a message's content
   */
  async editMessage(messageId: string, newContent: string): Promise<Message> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.branchManager.editMessage(messageId, newContent);
  }

  /**
   * Main chat method for interacting with the LLM
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    if (!this.initialized) {
      logger.info('Initializing LLM service for chat request');
      await this.initialize();
    }
    
    if (!this.model) {
      throw new Error('Model provider not initialized');
    }
    
    const {
      sessionId: providedSessionId,
      message,
      branchId = 'main',
      parentMessageId,
      systemPrompt,
      callbacks,
      websocket
    } = params;
    
    const startTime = Date.now();
    
    logger.info('Starting chat request:', {
      messageLength: message.length,
      hasSystemPrompt: !!systemPrompt,
      hasCallbacks: !!callbacks,
      hasWebSocket: !!websocket,
      branchId
    });
    
    // Get or create session
    const session = await this.getOrCreateSession(providedSessionId);
    const sessionId = session.id;
    
    // Get model configuration
    const modelId = this.config.model.modelId;
    const modelProvider = this.config.model.provider;
    
    // Generate request and message IDs
    const requestId = uuidv4();
    const messageId = uuidv4();
    
    try {
      const redisManager = this.memoryManager.getRedisManager();

      // Create user message
      const userMessage: Message = {
        id: uuidv4(),
        sessionId,
        role: 'user',
        content: message,
        timestamp: Date.now(),
        branchId,
        version: 1,
        metadata: {},
        ...(parentMessageId && { parentId: parentMessageId })
      };
      
      // Add message to Redis
      await redisManager.storeMessage(userMessage);
      logger.debug(`Added user message ${userMessage.id} to Redis`);
      
      // Create assistant message shell (will be filled in later)
      const assistantMessage: Message = {
        id: messageId,
        sessionId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        branchId,
        version: 1,
        metadata: {
          model: modelId,
          provider: modelProvider
        },
        parentId: userMessage.id
      };
      
      // Assemble context for the conversation
      const context = await this.memoryManager.assembleContext(
        sessionId,
        message,
        {
          maxTokens: this.config.defaultParams?.maxTokens || 4000,
          maxMessages: 10,
          useSimilarity: false,
          branchId
        }
      );

      // If we have a systemPrompt from params, add it to context
      if (systemPrompt && !context.systemPrompt) {
        context.systemPrompt = systemPrompt;
      }
      
      // Format messages for the model
      const modelMessages = this.formatMessagesForModel(context, message);
      
      // Get streaming response from model
      logger.info('Initiating chat completion with streaming');
      const response = await this.model.generateChatCompletion({
        messages: modelMessages.map(m => ({
          role: m.role,
          content: m.content
        })),
        systemPrompt: context.systemPrompt,
        stream: true,
        signal: params.signal
      });

      if (!('on' in response)) {
        throw new Error('Expected streaming response from model');
      }

      const controller = response as EventEmitter;
      let responseText = '';

      // Convert EventEmitter to AsyncIterable
      const streamIterator = eventEmitterToAsyncIterable(controller);

      // Use StreamingManager to handle the stream
      await this.streamingManager.streamResponse(
        sessionId,
        messageId,
        userMessage.id,
        streamIterator,
        {
          onToken: (token: string) => {
            responseText += token;
            if (callbacks?.onToken) {
              callbacks.onToken(token);
            }
          },
          onComplete: async () => {
            // Update assistant message with final content
            assistantMessage.content = responseText;
            await redisManager.storeMessage(assistantMessage);
            
            if (callbacks?.onComplete) {
              callbacks.onComplete();
            }
          },
          onError: (error: Error) => {
            logger.error('Stream error:', error);
            if (callbacks?.onError) {
              callbacks.onError(error);
            }
          },
          websocket
        }
      );
      
      // Create response object
      const chatResponse: ChatResponse = {
        text: responseText,
        sessionId,
        messageId: assistantMessage.id,
        branchId,
        metadata: {
          model: modelId,
          provider: modelProvider,
          branchInfo: {
            depth: 0,
            parentMessageId: userMessage.id
          }
        }
      };
      
      const endTime = Date.now();
      logger.info(`Chat request completed in ${endTime - startTime}ms`, {
        requestId,
        responseLength: responseText.length
      });
      
      return chatResponse;
      
    } catch (err) {
      const error = err as Error;
      const errorMessage = `Error processing chat request: ${error.message || 'Unknown error'}`;
      logger.error(errorMessage, { requestId, error });
      
      return {
        text: `Sorry, there was an error processing your request: ${error.message || 'Unknown error'}`,
        sessionId,
        messageId: uuidv4(),
        metadata: {
          model: modelId,
          provider: modelProvider,
          tokens: {
            prompt: 0,
            completion: 0,
            total: 0
          }
        }
      };
    }
  }

  /**
   * Format messages for the model
   */
  private formatMessagesForModel(context: Context, userMessage: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // Add system message if provided
    if (context.systemPrompt) {
      messages.push({
        role: 'system',
        content: context.systemPrompt
      });
    }
    
    // Add context messages
    for (const msg of context.messages) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    // Add the current user message if not already in context
    const lastContextMessage = context.messages[context.messages.length - 1];
    if (!lastContextMessage || lastContextMessage.role !== 'user' || lastContextMessage.content !== userMessage) {
      messages.push({
        role: 'user',
        content: userMessage
      });
    }
    
    return messages;
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
      const messages = await this.memoryManager.getRedisManager().getMessages(sessionId);
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
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    if (this.initialized) {
      logger.info('Shutting down LLM service');
      await this.memoryManager.cleanup();
      this.initialized = false;
    }
  }

  /**
   * Initialize or reinitialize the model provider
   */
  private async initializeProvider(modelId?: string, config?: Partial<ModelConfig>): Promise<void> {
    const providerConfig: ModelConfig = {
      provider: this.config.model.provider,
      modelId: modelId || this.config.model.modelId,
      baseUrl: this.config.model.baseUrl,
      temperature: config?.temperature,
      topP: config?.topP,
      topK: config?.topK
    };

    this.model = await ModelProviderFactory.getProvider(providerConfig);
    await this.model.initialize(providerConfig);
    
    logger.info('Model provider initialized', {
      provider: providerConfig.provider,
      modelId: providerConfig.modelId,
      hasConfig: !!config
    });
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
    const modelExists = models.some(m => m.name === modelId);
    if (!modelExists) {
      throw new Error(`Model ${modelId} not found`);
    }

    // Update session
    session.modelId = modelId;
    session.lastAccessedAt = Date.now();
    
    // Store in Redis
    await this.memoryManager.getRedisManager().updateSession(sessionId, session);
    
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
    config: Partial<Omit<ModelConfig, 'provider' | 'modelId' | 'baseUrl'>>
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
        modelId: session.modelId,
        baseUrl: this.config.model.baseUrl,
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK
      };
    } else {
      session.modelConfig = {
        ...session.modelConfig,
        temperature: config.temperature ?? session.modelConfig.temperature,
        topP: config.topP ?? session.modelConfig.topP,
        topK: config.topK ?? session.modelConfig.topK
      };
    }
    session.lastAccessedAt = Date.now();
    
    // Store in Redis
    await this.memoryManager.getRedisManager().updateSession(sessionId, session);
    
    logger.info('Session model config updated', {
      sessionId,
      config: session.modelConfig
    });

    return session;
  }

  /**
   * converts an array of messages to a prompt string for non-chat models
   */
  messagesToPrompt(messages: ChatMessage[]): string {
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
}

// Export a factory function for simpler instantiation
export function createLLMService(config: LLMServiceConfig): LLMService {
  return new LLMService(config);
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

// chat message format
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

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
      
      // Add remaining implementation here
      throw new Error('Not implemented');
    } catch (error) {
      const emitter = new EventEmitter() as StreamController;
      emitter.abort = () => {};
      emitter.emit('error', error instanceof ApiError ? error : new ApiError(500, 'error generating completion'));
      return emitter;
    }
  },
}