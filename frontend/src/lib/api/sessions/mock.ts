import { v4 as uuidv4 } from 'uuid';
import {
  Session,
  CreateSessionRequest,
  UpdateSessionRequest,
  GetSessionsResponse,
} from './types';

// Helper function to create a mock session with proper timestamps
function createMockSession(
  id: string,
  title: string,
  modelId: string,
  messageCount = 0
): Session {
  const now = new Date().toISOString();
  const nowTimestamp = new Date().getTime(); // Timestamp as number
  
  return {
    id,
    title,
    modelId,
    createdAt: nowTimestamp,
    lastAccessedAt: nowTimestamp,
    updatedAt: nowTimestamp, // Adding updatedAt to match ChatSession interface expectations
    messageCount,
    messages: [], // Adding empty messages array for compatibility
  };
}

// Mock sessions data
const mockSessions: Session[] = [
  createMockSession(
    uuidv4(),
    'Getting Started',
    'gpt-3.5-turbo',
    3
  ),
  createMockSession(
    uuidv4(),
    'Project Planning',
    'gpt-4',
    5
  ),
  createMockSession(
    uuidv4(),
    'Code Review',
    'llama-2-70b',
    2
  ),
];

export const mockResponses = {
  createSession: (request: CreateSessionRequest): Session => {
    const newSession = createMockSession(
      uuidv4(),
      request.title || 'New Chat',
      request.modelId,
      0
    );
    mockSessions.unshift(newSession);
    return newSession;
  },

  updateSession: (request: UpdateSessionRequest): Session => {
    const session = mockSessions.find(s => s.id === request.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const updatedSession = {
      ...session,
      title: request.title || session.title,
      modelId: request.modelId || session.modelId,
      lastAccessedAt: new Date().getTime(), // Update access timestamp
      updatedAt: new Date().getTime(), // Update modified timestamp
    };

    const index = mockSessions.findIndex(s => s.id === request.sessionId);
    mockSessions[index] = updatedSession;
    return updatedSession;
  },

  getSessions: (): GetSessionsResponse => ({
    success: true,
    sessions: mockSessions
  }),

  getSession: (sessionId: string): Session => {
    const session = mockSessions.find(s => s.id === sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    return session;
  },
}; 