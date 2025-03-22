import { BaseAPIClient } from '../base';
import { APIConfig } from '../types';
import {
  Session,
  CreateSessionRequest,
  CreateSessionResponse,
  UpdateSessionRequest,
  UpdateSessionResponse,
  GetSessionsResponse,
  GetSessionResponse,
} from './types';
import { mockResponses } from './mock';

// Flag to control mock mode
const USE_MOCKS = import.meta.env.VITE_ENABLE_MOCK_API === 'true';

// API version prefix
const API_PREFIX = 'api/v1';

export class SessionsAPI extends BaseAPIClient {
  constructor(config: APIConfig) {
    super(config);
  }

  /**
   * Create a new chat session
   */
  async createSession(request: CreateSessionRequest): Promise<Session> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return mockResponses.createSession(request);
    }

    const response = await this.post<CreateSessionResponse>(
      `${API_PREFIX}/chat/sessions`,
      {
        modelId: request.modelId,
        title: request.title || 'New Chat'
      }
    );
    return response.session;
  }

  /**
   * Update a chat session
   */
  async updateSession({ sessionId, modelId, title }: UpdateSessionRequest): Promise<Session> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return mockResponses.updateSession({ sessionId, modelId, title });
    }

    if (!sessionId) {
      throw new Error('Session ID is required for update');
    }

    console.log('Updating session:', { sessionId, modelId, title });

    // Use different endpoints based on what's being updated
    let response;
    
    // If we're updating the model, use the model-specific endpoint
    if (modelId && !title) {
      response = await this.post<UpdateSessionResponse>(
        `${API_PREFIX}/chat/sessions/${sessionId}/model`,
        { modelId }
      );
    } 
    // If we're updating the title, use a general update endpoint (currently not implemented)
    // In the future, we could add a specific endpoint for title updates
    else if (title) {
      // For now, logging that this isn't implemented yet
      console.warn('Title updates are not fully implemented in the backend yet');
      throw new Error('Title updates are not implemented yet');
    }
    
    console.log('Update session response:', response);
    return response.session;
  }

  /**
   * Get all chat sessions
   */
  async getSessions(): Promise<Session[]> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      const response = mockResponses.getSessions();
      return response.sessions;
    }

    // Get response and check its structure
    const response = await this.get<GetSessionsResponse>(`${API_PREFIX}/chat/sessions`);
    
    // Log the actual response for debugging
    console.log('Sessions API response:', response);
    
    // Handle both formats: {success, sessions} or just an array of sessions
    if (response && typeof response === 'object') {
      if ('success' in response && 'sessions' in response) {
        // Backend API format: { success: true, sessions: [...] }
        return response.sessions;
      } else if (Array.isArray(response)) {
        // Direct array of sessions
        return response;
      }
    }
    
    // If response is malformed, return empty array and log error
    console.error('Unexpected response format from sessions API:', response);
    return [];
  }

  /**
   * Get a specific chat session
   */
  async getSession(sessionId: string): Promise<Session> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 200));
      return mockResponses.getSession(sessionId);
    }

    const response = await this.get<{ success: boolean; session: Session }>(`${API_PREFIX}/chat/sessions/${sessionId}`);
    return response.session;
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      return;
    }

    await this.delete(`${API_PREFIX}/chat/sessions/${sessionId}`);
  }

  /**
   * Clear all messages in a session
   */
  async clearSession(sessionId: string): Promise<Session> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Mock implementation since it's not in mockResponses
      const session = mockResponses.getSession(sessionId);
      return {
        ...session,
        messageCount: 0
        // Don't add updatedAt if not in the Session type
      };
    }

    const response = await this.post<UpdateSessionResponse>(
      `${API_PREFIX}/chat/sessions/${sessionId}/clear`
    );
    return response.session;
  }

  /**
   * Checks the health of a session
   */
  async checkSessionHealth(sessionId: string): Promise<{ status: 'active' | 'stale' | 'error', session?: any }> {
    if (USE_MOCKS) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // For mocks, just pretend all sessions are active
      return { 
        status: 'active',
        session: mockResponses.getSession(sessionId)
      };
    }

    try {
      const response = await this.get<{ 
        success: boolean; 
        status: 'active' | 'stale'; 
        session: any 
      }>(`${API_PREFIX}/chat/sessions/${sessionId}/health`);
      
      return {
        status: response.status,
        session: response.session
      };
    } catch (error) {
      console.error('Session health check failed:', error);
      return { status: 'error' };
    }
  }
}

// Create and export a singleton instance
export const sessionsAPI = new SessionsAPI({
  baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  retryAttempts: 3,
}); 