// @ts-nocheck
/**
 * llm service
 * 
 * abstract provider interface for different llm backends.
 * handles model management, streaming, and provider selection.
 */

import { EventEmitter } from 'events';
import { ollamaService, StreamController } from './ollama';
import logger from '../../utils/logger';
import { config } from '../../config/index';
import { ApiError } from '../../middleware/errorHandler';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ModelProviderFactory } from './providers';
import { ChatParams, ChatResponse, LLMServiceConfig, Session, Context, Message } from './types';
import { MemoryManager } from './memory';
import { RedisManager } from './memory/redis';
import { ContextManager } from './memory/context';
import { BranchManager, Branch } from './memory/branch';
import { VectorStore } from './memory/vector';
import { EmbeddingService } from './memory/embedding';
import { DEFAULT_MEMORY_CONFIG } from './memory/config';
import { TokenCounter, TokenTracker } from './tokens';
import { v4 as uuidv4 } from 'uuid';
import { TokenLogger } from './tokens/tokenLogger';
import { StreamingManager } from './streaming';

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
      
      // route to appropriate provider
      if (model.provider === 'ollama') {
        return ollamaService.generateCompletion({
          model: model.id,
          prompt: request.prompt,
          stream: true,
          options: {
            temperature: request.temperature,
            top_p: request.topP,
            stop: request.stop,
          },
          system: request.systemPrompt,
          context: request.context,
        });
      }
      
      // provider not implemented
      const emitter = new EventEmitter() as StreamController;
      emitter.abort = () => {}; // dummy abort function
      emitter.emit('error', new ApiError(501, `provider ${model.provider} not implemented`));
      return emitter;
      
    } catch (error) {
      logger.error('error generating completion', { error, model: request.model });
      const emitter = new EventEmitter() as StreamController;
      emitter.abort = () => {}; // dummy abort function
      emitter.emit('error', error instanceof ApiError ? error : new ApiError(500, 'error generating completion'));
      return emitter;
    }
  },
  
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
};

export class LLMService {
  private config: LLMServiceConfig;
  private model: Awaited<ReturnType<typeof ModelProviderFactory.getProvider>>;
  private memoryManager: MemoryManager;
  private tokenCounter: TokenCounter;
  private tokenTracker: TokenTracker;
  private tokenLogger: TokenLogger;
  private streamingManager: StreamingManager;

  constructor(config: LLMServiceConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Initialize model provider
    try {
      this.model = await ModelProviderFactory.getProvider(this.config.model);
      logger.info(`Initialized LLM provider: ${this.config.model.provider}`);
    } catch (error) {
      logger.error('Failed to initialize LLM provider:', error);
      throw error;
    }

    // Initialize memory system if config is provided
    if (this.config.memory) {
      const memoryConfig = {
        ...DEFAULT_MEMORY_CONFIG,
        ...this.config.memory
      };

      try {
        // Initialize Redis manager if URL provided
        let redisManager: RedisManager | undefined;
        if (memoryConfig.redisUrl) {
          redisManager = new RedisManager(memoryConfig.redisUrl);
          await redisManager.connect();
          logger.info('Redis connection established');
        }

        // Initialize vector store if config provided
        let vectorStore: VectorStore | undefined;
        if (memoryConfig.vectorStore) {
          const embeddingService = new EmbeddingService({
            model: memoryConfig.vectorStore.embeddingModel || 'default'
          });
          
          vectorStore = new VectorStore({
            embeddingService,
            config: memoryConfig.vectorStore
          });
          
          logger.info('Vector store initialized');
        }

        // Create memory manager
        this.memoryManager = new MemoryManager({
          redisManager,
          vectorStore,
          sessionTTL: memoryConfig.sessionTTL
        });
        
        // Initialize streaming manager with Redis for tracking
        this.streamingManager = new StreamingManager(redisManager);
        logger.info('Streaming manager initialized');

        logger.info('Memory system initialized');
      } catch (error) {
        logger.error('Failed to initialize memory system:', error);
        throw error;
      }
    }

    // Initialize token counter and tracker
    try {
      this.tokenCounter = new TokenCounter(this.config.model.baseUrl);
      this.tokenTracker = new TokenTracker(this.memoryManager.redisManager);
      
      // Initialize token logger if we have Redis
      if (this.memoryManager?.redisManager) {
        this.tokenLogger = new TokenLogger(this.memoryManager.redisManager);
      }
      
      logger.info('Token tracking system initialized');
    } catch (error) {
      logger.error('Failed to initialize token tracking:', error);
    }

    logger.info('LLM service initialized successfully');
  }

  // Session Management
  async startSession(): Promise<Session> {
    const session: Session = {
      id: uuidv4(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      messageCount: 0,
      branches: [],
    };

    if (this.memoryManager) {
      await this.memoryManager.getRedisManager().setSession(session);
    }

    return session;
  }

  async getOrCreateSession(sessionId?: string): Promise<Session> {
    if (!sessionId) {
      return this.startSession();
    }

    if (this.memoryManager) {
      const session = await this.memoryManager.getRedisManager().getSession(sessionId);
      if (session) {
        return session;
      }
    }

    return this.startSession();
  }

  // Branch Management
  async createBranch(
    sessionId: string, 
    originMessageId: string, 
    name?: string
  ): Promise<Branch> {
    if (!this.memoryManager) {
      throw new Error('Memory management not available');
    }
    
    return this.memoryManager.getBranchManager().createBranch(sessionId, originMessageId, { name });
  }

  async getBranches(sessionId: string): Promise<Branch[]> {
    if (!this.memoryManager) {
      return [];
    }
    
    return this.memoryManager.getBranchManager().getBranches(sessionId);
  }

  async editMessage(messageId: string, newContent: string): Promise<Message> {
    if (!this.memoryManager) {
      throw new Error('Message editing not available');
    }
    
    const message = await this.memoryManager.getBranchManager().editMessage(messageId, newContent);
    
    // If vector store is enabled, update the embedding
    if (this.memoryManager.getVectorStore() && this.memoryManager.getEmbeddingService()) {
      try {
        // Generate new embedding for edited content
        const embedding = await this.memoryManager.getEmbeddingService()!.embedText(newContent);
        
        // Update embedding in vector store
        await this.memoryManager.getVectorStore()!.updateEmbedding(
          messageId,
          newContent,
          embedding,
          {
            sessionId: message.sessionId,
            role: message.role,
            branchId: message.branchId,
            timestamp: message.timestamp,
            version: message.version
          }
        );
      } catch (error) {
        logger.warn('Failed to update message embedding:', error);
        // Continue even if embedding update fails
      }
    }
    
    return message;
  }

  // Context Management
  private async assembleContext(params: ChatParams): Promise<Context> {
    // Basic context assembly with recency
    const context = await this.memoryManager.getContextManager().assembleContext(
      params.sessionId!,
      {
        branchId: params.branchId
      }
    );
    
    // If RAG is requested, enhance with semantic search
    if (params.chainType === 'rag' && params.message) {
      const vectorStore = this.memoryManager.getVectorStore();
      const embeddingService = this.memoryManager.getEmbeddingService();
      
      if (vectorStore && embeddingService) {
        return this.memoryManager.assembleContext(
          params.sessionId!,
          params.message,
          {
            branchId: params.branchId,
            useSimilarity: true,
            includeBranches: true
          }
        );
      }
    }
    
    return context;
  }

  // Main Chat Method
  async chat(params: ChatParams): Promise<ChatResponse> {
    // Get or create session
    const session = await this.getOrCreateSession(params.sessionId);
    params.sessionId = session.id;

    // Assemble context using ContextManager
    const context = await this.memoryManager.assembleContext(params);

    // Create user message ID
    const messageId = uuidv4();
    
    // Estimate prompt token count for user message
    let promptTokens = 0;
    let completionTokens = 0;
    
    if (this.tokenCounter) {
      // Count user message tokens
      promptTokens = await this.tokenCounter.countTokens(params.message, {
        model: this.config.model.modelId
      });
      
      // Add tokens for context messages
      if (context.systemPrompt) {
        promptTokens += await this.tokenCounter.countTokens(context.systemPrompt, {
          model: this.config.model.modelId
        });
      }
      
      for (const msg of context.messages) {
        promptTokens += msg.metadata?.tokens || 
          await this.tokenCounter.countTokens(msg.content, {
            model: this.config.model.modelId
          });
      }
    }

    // Create user message
    const userMessage: Message = {
      id: messageId,
      sessionId: session.id,
      content: params.message,
      role: 'user',
      timestamp: Date.now(),
      branchId: params.branchId,
      parentMessageId: params.parentMessageId,
      version: 1,
      metadata: {
        tokens: promptTokens
      }
    };

    // Store user message using MemoryManager
    if (this.memoryManager) {
      await this.memoryManager.storeMessage(userMessage);
    }

    // Prepare messages for the model
    const formattedMessages = this.formatMessagesForModel(context, params.message);

    try {
      // Generate response ID early for tracking
      const assistantMessageId = uuidv4();
      
      // Handle streaming if WebSocket is provided
      if (params.websocket && this.model.generateStream) {
        // Register the connection with the streaming manager
        const connectionId = this.streamingManager.registerConnection(session.id, params.websocket);
        
        // Start streaming in a non-blocking way
        const stream = await this.model.generateStream(params);
        this.streamingManager.streamResponse(
          connectionId,
          session.id,
          assistantMessageId,
          stream,
          params.callbacks
        ).then(async (progress) => {
          // After streaming is complete, store the message
          if (progress.status === 'completed' && this.memoryManager) {
            // Get the accumulated content from the websocket message
            // In a real implementation, you'd get this from the accumulated content
            // This is a placeholder - needs to be completed with real implementation
            const content = ""; // We need a way to get the accumulated content
            
            // Create assistant message
            const assistantMessage: Message = {
              id: assistantMessageId,
              sessionId: session.id,
              content: content,
              role: 'assistant',
              timestamp: Date.now(),
              branchId: params.branchId,
              parentMessageId: messageId,
              version: 1,
              metadata: {
                tokens: progress.tokenCount
              }
            };
            
            // Store assistant message
            await this.memoryManager.storeMessage(assistantMessage);
            
            // Track token usage
            if (this.tokenTracker) {
              await this.tokenTracker.trackTokenUsage(
                session.id,
                promptTokens,
                progress.tokenCount
              );
            }
          }
        }).catch(error => {
          logger.error(`Error processing stream completion: ${error.message}`);
        });
        
        // Return partial response for streaming
        return {
          text: "",  // Text will be streamed
          sessionId: session.id,
          messageId: assistantMessageId,
          branchId: params.branchId,
          metadata: {
            model: this.config.model.modelId,
            provider: this.config.model.provider,
            tokens: {
              prompt: promptTokens,
              completion: 0, // Will be updated as tokens are streamed
              total: promptTokens
            },
            branchInfo: params.branchId ? {
              parentMessageId: params.parentMessageId,
              depth: 1 // Will be calculated properly in a real implementation
            } : undefined
          }
        };
      }

      // Non-streaming path
      const response = await this.model.invoke(formattedMessages, {
        callbacks: params.callbacks ? {
          handleLLMNewToken: params.callbacks.onToken,
          handleLLMStart: params.callbacks.onStart,
          handleLLMEnd: params.callbacks.onComplete,
          handleLLMError: params.callbacks.onError,
        } : undefined,
      });
      
      // Count completion tokens
      if (this.tokenCounter) {
        completionTokens = await this.tokenCounter.countTokens(response.content, {
          model: this.config.model.modelId
        });
      }

      // Create assistant message
      const assistantMessage: Message = {
        id: assistantMessageId,
        sessionId: session.id,
        content: response.content,
        role: 'assistant',
        timestamp: Date.now(),
        branchId: params.branchId,
        parentMessageId: messageId,
        version: 1,
        metadata: {
          tokens: completionTokens
        }
      };
      
      // Store assistant message using MemoryManager
      if (this.memoryManager) {
        await this.memoryManager.storeMessage(assistantMessage);
      }

      // Track token usage
      if (this.tokenTracker) {
        await this.tokenTracker.trackTokenUsage(
          session.id,
          promptTokens,
          completionTokens
        );
      }

      return {
        text: response.content,
        sessionId: session.id,
        messageId: assistantMessageId,
        branchId: params.branchId,
        metadata: {
          model: this.config.model.modelId,
          provider: this.config.model.provider,
          tokens: {
            prompt: promptTokens,
            completion: completionTokens,
            total: promptTokens + completionTokens
          },
          branchInfo: params.branchId ? {
            parentMessageId: params.parentMessageId,
            depth: 1 // Will be calculated properly in a real implementation
          } : undefined
        }
      };
    } catch (error) {
      logger.error(`Error generating chat completion: ${error.message}`);
      throw error;
    }
  }

  // Message Processing
  private async processMessage(message: Message): Promise<void> {
    try {
      if (!this.memoryManager) {
        return;
      }
      
      // Count tokens in the message and update metadata
      const tokens = await this.tokenCounter.countTokens(
        message.content, 
        { model: this.config.model.modelId }
      );
      
      message.metadata = {
        ...message.metadata,
        tokens
      };
      
      // Store message and generate embedding if vector store is available
      const hasVectorStore = !!this.memoryManager.getVectorStore();
      const hasEmbeddingService = !!this.memoryManager.getEmbeddingService();
      
      await this.memoryManager.storeMessage(
        message,
        hasVectorStore && hasEmbeddingService // Only generate embedding if both components are available
      );
      
      // Track token usage if tokenTracker is available
      if (this.tokenTracker) {
        await this.tokenTracker.trackMessageTokens(message, this.config.model.modelId);
      }

      // Log token count to Supabase if tokenLogger is available
      if (this.tokenLogger) {
        await this.tokenLogger.logTokenCount({
          session_id: message.sessionId,
          user_id: message.metadata?.userId || 'anonymous',
          message_id: message.id,
          role: message.role,
          text_length: message.content.length,
          token_count: tokens,
          model: this.config.model.modelId,
          metadata: {
            ...message.metadata,
            persistedAt: Date.now()
          }
        });
      }
    } catch (error) {
      logger.error(`Error processing message: ${error}`, { messageId: message.id });
    }
  }

  // Helper Methods
  private formatMessagesForModel(context: Context, userMessage: string) {
    const messages = [];
    
    // Add system prompt if available
    if (context.systemPrompt) {
      messages.push(new SystemMessage(context.systemPrompt));
    }
    
    // Add context messages
    for (const msg of context.messages) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      }
      // Skip system messages as they're handled separately
    }
    
    // Add current user message
    messages.push(new HumanMessage(userMessage));
    
    return messages;
  }

  /**
   * Get token usage for a session with Supabase integration
   */
  async getSessionTokenUsage(sessionId: string): Promise<{ 
    prompt: number; 
    completion: number; 
    total: number; 
  }> {
    if (this.tokenLogger) {
      try {
        const usage = await this.tokenLogger.getSessionTokenUsage(sessionId);
        return {
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
          total: usage.total_tokens
        };
      } catch (error) {
        logger.error(`Error getting session token usage from Supabase: ${error}`);
      }
    }
    
    // Fallback to Redis-based token tracking
    if (this.tokenTracker) {
      return this.tokenTracker.getSessionTokenUsage(sessionId);
    }
    
    return { prompt: 0, completion: 0, total: 0 };
  }
  
  /**
   * Find semantically similar messages
   */
  async findSimilarMessages(
    sessionId: string,
    query: string,
    options: {
      limit?: number;
      threshold?: number;
    } = {}
  ): Promise<Message[]> {
    if (!this.memoryManager) {
      logger.warn('Memory manager not initialized, cannot find similar messages');
      return [];
    }
    
    try {
      return await this.memoryManager.findSimilarMessages(
        sessionId,
        query,
        {
          limit: options.limit || 5,
          threshold: options.threshold || 0.7,
          includeBranches: true
        }
      );
    } catch (error) {
      logger.error(`Error finding similar messages: ${error}`, { sessionId });
      // Fallback to recent messages
      const context = await this.memoryManager.getContextManager().assembleContext(sessionId, {});
      return context.messages;
    }
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    if (this.memoryManager) {
      await this.memoryManager.cleanup();
    }
  }

  /**
   * Get token usage analytics
   */
  async getTokenUsageAnalytics(
    interval: 'hour' | 'day' | 'week' | 'month' = 'day',
    startDate?: Date,
    endDate?: Date
  ) {
    if (this.tokenLogger) {
      return this.tokenLogger.getTokenUsageAnalytics(interval, startDate, endDate);
    }
    return [];
  }
} 