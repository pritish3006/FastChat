import { ModelConfig } from '@/lib/types/models';
import { Message } from '@/lib/types/chat';

export interface Session {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  updatedAt?: number;
  messageCount: number;
  branches?: string[];
  modelId?: string;
  modelConfig?: ModelConfig;
  title?: string;
  messages?: Message[];
}

export interface CreateSessionRequest {
  modelId: string;
  title?: string;
}

export interface CreateSessionResponse {
  success: boolean;
  session: Session;
}

export interface UpdateSessionRequest {
  sessionId: string;
  modelId?: string;
  title?: string;
}

export interface UpdateSessionResponse {
  success: boolean;
  session: Session;
}

export interface GetSessionsResponse {
  success: boolean;
  sessions: Session[];
}

export interface GetSessionResponse {
  success: boolean;
  session: Session;
}

export interface ClearSessionResponse {
  success: boolean;
  session: Session;
} 