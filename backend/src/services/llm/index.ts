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

  constructor(config: LLMServiceConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Initialize provider
    const provider = ModelProviderFactory.getProvider(this.config.model);
    this.model = await provider.initialize(this.config.model);
    
    // Initialize token counter with base URL from config
    const ollamaBaseUrl = this.config.model.baseUrl || 'http://localhost:11434';
    this.tokenCounter = new TokenCounter(ollamaBaseUrl);

    // Initialize Memory Manager if configured
    if (this.config.memory?.redisUrl) {
      // Configure memory manager with vector store and embedding service
      const memoryConfig: MemoryManagerConfig = {
        redisUrl: this.config.memory.redisUrl,
        sessionTTL: this.config.memory.sessionTTL
      };
      
      // Add vector store if configured
      if (this.config.memory.vectorStore) {
        memoryConfig.vectorStore = {
          type: 'supabase',
          supabaseUrl: this.config.memory.vectorStore.supabaseUrl,
          supabaseKey: this.config.memory.vectorStore.supabaseKey,
          tableName: this.config.memory.vectorStore.tableName
        };
        
        // Add embedding service if vector store is configured
        memoryConfig.embeddingService = {
          apiUrl: ollamaBaseUrl,
          model: this.config.memory.vectorStore.embeddingModel || this.config.model.modelId
        };

        // Add database configuration if vector store is configured (same Supabase instance)
        memoryConfig.database = {
          supabaseUrl: this.config.memory.vectorStore.supabaseUrl,
          supabaseKey: this.config.memory.vectorStore.supabaseKey,
          messagesTable: 'messages',
          sessionsTable: 'chat_sessions'
        };

        // Configure persistence options
        memoryConfig.persistenceOptions = {
          persistImmediately: true, // Store in DB immediately (can be changed to false for batch processing)
          maxRedisAge: 7 * 24 * 60 * 60, // Keep in Redis for 7 days
          batchSize: 50 // Batch size for bulk operations
        };
      }
      
      // Initialize memory manager with all components
      this.memoryManager = new MemoryManager(memoryConfig);
      await this.memoryManager.initialize();
      
      // Initialize token tracker
      this.tokenTracker = new TokenTracker(
        this.memoryManager.getRedisManager(), 
        this.tokenCounter,
        {
          enableRateLimiting: false  // As per your requirement, no rate limiting based on tokens
        }
      );
    }
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

    // Assemble context
    const context = await this.assembleContext(params);

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

    // Save user message
    if (this.memoryManager) {
      await this.memoryManager.storeMessage(userMessage);
    }

    // Prepare messages for the model
    const formattedMessages = this.formatMessagesForModel(context, params.message);

    try {
      // Handle streaming if WebSocket is provided
      if (params.websocket && this.model.generateStream) {
        const stream = await this.model.generateStream(params);
        this.handleStream(stream, params.websocket, params.callbacks);
      }

      // Generate response
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
      const assistantMessageId = uuidv4();
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
      
      // Save assistant message
      if (this.memoryManager) {
        await this.memoryManager.storeMessage(assistantMessage);
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
            depth: context.messages.length,
            parentMessageId: params.parentMessageId,
          } : undefined,
        },
      };
    } catch (error) {
      throw new Error(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Stream Handling
  private async handleStream(
    stream: AsyncIterator<any>,
    ws: WebSocket,
    callbacks?: StreamCallbacks
  ): Promise<void> {
    try {
      callbacks?.onStart?.();

      for await (const chunk of stream) {
        const token = chunk.toString();
        ws.send(JSON.stringify({ type: 'token', content: token }));
        callbacks?.onToken?.(token);
      }

      callbacks?.onComplete?.();
      ws.send(JSON.stringify({ type: 'done' }));
    } catch (error) {
      callbacks?.onError?.(error as Error);
      ws.send(JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Stream error' }));
    }
  }

  /**
   * Get token usage for a session
   */
  async getSessionTokenUsage(sessionId: string): Promise<{ 
    prompt: number; 
    completion: number; 
    total: number; 
  }> {
    if (!this.tokenTracker) {
      return { prompt: 0, completion: 0, total: 0 };
    }
    
    return this.tokenTracker.getSessionTokenUsage(sessionId);
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
} 