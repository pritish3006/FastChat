import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { EventEmitter } from 'events';

export interface AgentConfig {
  name: string;
  description: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface VoiceOptions {
  voice?: string;
  model?: string;
  sttModel?: string;
  speed?: number;
  pitch?: number;
  language?: string;
}

export interface AgentContext {
  message: string;
  history: ChatCompletionMessageParam[];
  config: {
    apiKey: string;
    searchApiKey: string;
    voiceApiKey: string;
  };
  flags: {
    needsSearch?: boolean;
    needsSummary?: boolean;
    summaryMode?: 'search' | 'chat' | 'voice';
    needsVoice?: boolean;
    voiceText?: string;
    voiceOptions?: VoiceOptions;
    workflowType?: 'chat' | 'voice' | 'search';
  };
  currentQuery?: string;  // Current query being processed
  audioInput?: Buffer;  // Optional audio input for speech-to-text operations
  intermediateSteps: AgentStep[];  // Track steps taken by agents
  toolResults: {
    queryAnalysis?: {
      needsSearch: boolean;
      needsVoice: boolean;
      searchQuery?: string;
      voiceText?: string;
    };
    search?: any[];
    summary?: string;
    voice?: {
      audio?: string;
      text?: string;
      confidence?: number;
      words?: any[];
    };
    speech?: {
      audio: string;
      format: string;
      text: string;
    };
    response?: string;
  };
}

export interface AgentStep {
  agent: string;
  model?: string;
  temperature?: number;
  input: string;
  output: any;
  timestamp: number;
}

export interface AgentResult {
  output: any;
  context: AgentContext;
  error?: Error;
}

export interface StreamingConfig {
  onToken?: (token: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onToolStart?: (tool: string) => void;
  onToolEnd?: (tool: string, result: any) => void;
}

export interface BaseAgentOptions {
  config: AgentConfig;
  streaming?: StreamingConfig;
}

export interface AgentExecutor {
  execute(context: AgentContext): Promise<AgentResult>;
}

// Graph-related types
export interface Node {
  id: string;
  agent: AgentExecutor;
  condition?: (context: AgentContext) => boolean | Promise<boolean>;
}

export interface Edge {
  from: string;
  to: string;
  condition?: (context: AgentContext) => boolean | Promise<boolean>;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface WorkflowState extends EventEmitter {
  context: AgentContext;
  currentNode?: string;
  completed: boolean;
  error?: Error;
}

export type AgentFunction = (context: AgentContext) => Promise<AgentResult>;

// Memory-related types
export interface MemoryManager {
  get(sessionId: string): Promise<AgentContext | null>;
  save(sessionId: string, context: AgentContext): Promise<void>;
  update(sessionId: string, context: Partial<AgentContext>): Promise<void>;
  delete(sessionId: string): Promise<void>;
} 