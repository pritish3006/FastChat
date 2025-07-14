import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/lib/store';
import { 
  fetchSessions, 
  createSession, 
  deleteSession,
  clearSession,
  setCurrentSession,
  syncTimestamp
} from '@/lib/store/slices/chatSlice';
import { sessionsAPI } from '@/lib/api/sessions/sessions.api';
import { Session } from '@/lib/api/sessions/types';
import { ChatSession } from '@/lib/types/chat';
import { toast } from 'sonner';

// Helper function to convert API session to ChatSession
function convertToChatSession(apiSession: Session): ChatSession {
  // Ensure all required fields are present
  const session: ChatSession = {
    id: apiSession.id,
    title: apiSession.title || 'Untitled',
    modelId: apiSession.modelId || 'gpt-3.5-turbo',
    createdAt: apiSession.createdAt || new Date().toISOString(),
    messageCount: apiSession.messageCount || 0,
    messages: apiSession.messages || [],
    // Mandatory fields from the ChatSession interface
    lastAccessedAt: apiSession.lastAccessedAt || apiSession.updatedAt || new Date().getTime(),
  };
  
  // Add optional fields if they exist
  if (apiSession.updatedAt) session.updatedAt = apiSession.updatedAt;
  if (apiSession.branches) session.branches = apiSession.branches;
  
  return session;
}

/**
 * A custom hook that provides a hybrid approach for session management,
 * combining Redux state with direct API access for resilience
 */
export function useHybridSessions() {
  const dispatch = useDispatch();
  
  // Access Redux state
  const reduxSessions = useSelector((state: RootState) => state.chat.sessions);
  const currentSessionId = useSelector((state: RootState) => state.chat.currentSessionId);
  const currentModel = useSelector((state: RootState) => state.chat.currentModel);
  const lastSyncTimestamp = useSelector((state: RootState) => state.chat.lastSyncTimestamp);
  
  // Local state for direct API access fallback
  const [localSessions, setLocalSessions] = useState<ChatSession[]>([]);
  const [isDirectFetching, setIsDirectFetching] = useState(false);
  const [directFetchError, setDirectFetchError] = useState<string | null>(null);
  const lastDirectFetchRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  
  // Debug information
  const [debugInfo, setDebugInfo] = useState({
    reduxSessionCount: 0,
    localSessionCount: 0,
    lastFetchAttempt: null as Date | null,
    lastSuccessSource: null as 'redux' | 'direct' | null,
  });

  /**
   * Fetches sessions directly from the API
   * @param force Force refetch even if recently fetched
   */
  const fetchDirectSessions = useCallback(async (force = false) => {
    // Don't fetch too frequently unless forced
    const now = Date.now();
    if (!force && now - lastDirectFetchRef.current < 5000) {
      console.log('Skipping direct fetch - called too recently');
      return;
    }
    
    // Update last fetch time
    lastDirectFetchRef.current = now;
    
    // Start fetching
    setIsDirectFetching(true);
    setDirectFetchError(null);
    
    try {
      console.log('🌐 Directly fetching sessions from API...');
      const sessions = await sessionsAPI.getSessions();
      
      if (!isMountedRef.current) return;
      
      console.log(`🌐 Direct API fetch completed, got ${sessions.length} sessions`);
      
      // Convert to Chat Sessions format
      const convertedSessions = sessions.map(convertToChatSession);
      
      setLocalSessions(convertedSessions);
      setDebugInfo(prev => ({
        ...prev,
        localSessionCount: convertedSessions.length,
        lastFetchAttempt: new Date(),
        lastSuccessSource: 'direct'
      }));
      
      // If redux state is empty but we got sessions directly, sync with redux
      if (reduxSessions.length === 0 && convertedSessions.length > 0) {
        console.log('Syncing directly fetched sessions to Redux state');
        try {
          dispatch({ type: 'chat/directFetchSync', payload: convertedSessions });
          dispatch(syncTimestamp());
        } catch (syncError) {
          console.error('Failed to sync direct sessions to Redux:', syncError);
        }
      }
      
      return convertedSessions;
    } catch (error) {
      console.error('Direct API fetch failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch sessions directly';
      setDirectFetchError(errorMessage);
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsDirectFetching(false);
      }
    }
  }, [dispatch, reduxSessions.length]);

  /**
   * Loads sessions with Redux first and falls back to direct API if needed
   */
  const loadSessions = useCallback(async (force = false) => {
    console.group('🔄 loadSessions (hybrid approach)');
    console.log('Starting loadSessions with hybrid approach');
    
    try {
      // First attempt: Try Redux action
      console.log('Attempting to load sessions via Redux');
      await dispatch(fetchSessions());
      
      // Check if we got sessions from Redux
      const updatedReduxSessions = (await dispatch(fetchSessions())).payload;
      const reduxSuccess = Array.isArray(updatedReduxSessions) && updatedReduxSessions.length > 0;
      
      if (reduxSuccess) {
        console.log('Successfully loaded sessions via Redux:', updatedReduxSessions.length);
        setDebugInfo(prev => ({
          ...prev,
          reduxSessionCount: updatedReduxSessions.length,
          lastFetchAttempt: new Date(),
          lastSuccessSource: 'redux'
        }));
        console.groupEnd();
        return true;
      }
      
      // Second attempt: Try direct API fetch
      console.log('Redux fetch returned no sessions, trying direct API...');
      const directSessions = await fetchDirectSessions(force);
      
      const directSuccess = Array.isArray(directSessions) && directSessions.length > 0;
      
      if (directSuccess) {
        console.log('Successfully loaded sessions via direct API:', directSessions.length);
        console.groupEnd();
        return true;
      }
      
      // Both methods failed or returned empty results
      console.log('Both Redux and direct API approaches returned no sessions');
      console.groupEnd();
      return false;
    } catch (error) {
      console.error('Error in loadSessions:', error);
      console.groupEnd();
      return false;
    }
  }, [dispatch, fetchDirectSessions]);

  /**
   * Creates a new session using both Redux and direct API methods
   * for maximum reliability
   */
  const createNewSession = useCallback(async ({ title, modelId }: { title?: string; modelId?: string }) => {
    console.group('➕ createNewSession (hybrid approach)');
    
    try {
      // Prepare model ID
      const modelToUse = modelId || currentModel || 'gpt-3.5-turbo';
      console.log('Creating new session with model:', modelToUse);
      
      // First attempt: Try Redux action
      const reduxPromise = dispatch(createSession({ title, modelId: modelToUse }));
      
      // Second attempt: Try direct API
      const directPromise = (async () => {
        try {
          const session = await sessionsAPI.createSession({ 
            title, 
            modelId: modelToUse 
          });
          
          // Convert API response to ChatSession format
          return convertToChatSession(session);
        } catch (error) {
          console.error('Direct API session creation failed:', error);
          return null;
        }
      })();
      
      // Wait for either method to succeed
      const [reduxResult, directResult] = await Promise.allSettled([reduxPromise, directPromise]);
      
      // Check if either method succeeded
      const reduxSucceeded = reduxResult.status === 'fulfilled' && reduxResult.value?.payload?.id;
      const directSucceeded = directResult.status === 'fulfilled' && directResult.value?.id;
      
      console.log('Session creation results:', {
        reduxSucceeded,
        directSucceeded,
        reduxSession: reduxSucceeded ? reduxResult.value.payload : null,
        directSession: directSucceeded ? directResult.value : null
      });
      
      if (reduxSucceeded) {
        const newSessionId = reduxResult.value.payload.id;
        console.log('Redux session creation succeeded, setting current session:', newSessionId);
        dispatch(setCurrentSession(newSessionId));
        
        // Also update local sessions if direct API failed
        if (!directSucceeded && directResult.status === 'fulfilled' && directResult.value) {
          setLocalSessions(prev => [directResult.value as ChatSession, ...prev]);
        }
        
        console.groupEnd();
        return {
          success: true,
          sessionId: newSessionId,
          source: 'redux'
        };
      } else if (directSucceeded) {
        const newSession = directResult.value as ChatSession;
        console.log('Direct API session creation succeeded, updating local state:', newSession.id);
        
        // Update local sessions
        setLocalSessions(prev => [newSession, ...prev]);
        
        // Try to sync back to Redux
        try {
          dispatch(setCurrentSession(newSession.id));
          // Force a sessions refresh to get the new session into Redux
          dispatch(fetchSessions());
        } catch (syncError) {
          console.error('Failed to sync new session to Redux:', syncError);
        }
        
        console.groupEnd();
        return {
          success: true,
          sessionId: newSession.id,
          source: 'direct'
        };
      }
      
      // Both methods failed
      console.error('Both Redux and direct API session creation failed');
      toast.error('Failed to create new session');
      console.groupEnd();
      return {
        success: false,
        error: 'Failed to create session with either method'
      };
    } catch (error) {
      console.error('Error in createNewSession:', error);
      toast.error('Failed to create new session');
      console.groupEnd();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error creating session'
      };
    }
  }, [dispatch, currentModel]);

  /**
   * Selects a session, attempting Redux first then falling back to local state
   */
  const selectSession = useCallback((sessionId: string) => {
    if (!sessionId) {
      console.error('Invalid session ID provided to selectSession');
      return false;
    }
    
    try {
      // Try to set the session in Redux first
      dispatch(setCurrentSession(sessionId));
      return true;
    } catch (error) {
      console.error('Failed to set current session in Redux:', error);
      return false;
    }
  }, [dispatch]);

  /**
   * Deletes a session using Redux first, falling back to direct API
   */
  const removeSession = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      console.error('Invalid session ID provided to removeSession');
      return { success: false, error: 'Invalid session ID' };
    }
    
    try {
      // Try Redux first
      const result = await dispatch(deleteSession(sessionId));
      
      if (result.meta.requestStatus === 'fulfilled') {
        // Also update local sessions
        setLocalSessions(prev => prev.filter(s => s.id !== sessionId));
        return { success: true, source: 'redux' };
      }
      
      // If Redux fails, try direct API
      try {
        await sessionsAPI.deleteSession(sessionId);
        setLocalSessions(prev => prev.filter(s => s.id !== sessionId));
        return { success: true, source: 'direct' };
      } catch (directError) {
        console.error('Failed to delete session via direct API:', directError);
        return { 
          success: false, 
          error: directError instanceof Error ? directError.message : 'Failed to delete session' 
        };
      }
    } catch (error) {
      console.error('Error in removeSession:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error deleting session' 
      };
    }
  }, [dispatch]);

  /**
   * Clears a session's messages using Redux first, falling back to direct API
   */
  const clearSessionMessages = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      console.error('Invalid session ID provided to clearSessionMessages');
      return { success: false, error: 'Invalid session ID' };
    }
    
    try {
      // Try Redux first
      const result = await dispatch(clearSession(sessionId));
      
      if (result.meta.requestStatus === 'fulfilled') {
        return { success: true, source: 'redux' };
      }
      
      // If Redux fails, try direct API
      try {
        const updatedSession = await sessionsAPI.clearSession(sessionId);
        
        // Update local sessions
        setLocalSessions(prev => 
          prev.map(s => s.id === sessionId 
            ? { ...s, messages: [], messageCount: 0 } 
            : s
          )
        );
        
        return { success: true, source: 'direct', session: convertToChatSession(updatedSession) };
      } catch (directError) {
        console.error('Failed to clear session via direct API:', directError);
        return { 
          success: false, 
          error: directError instanceof Error ? directError.message : 'Failed to clear session' 
        };
      }
    } catch (error) {
      console.error('Error in clearSessionMessages:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error clearing session' 
      };
    }
  }, [dispatch]);

  // On mount, set up the ref
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update debug info when dependencies change
  useEffect(() => {
    setDebugInfo(prev => ({
      ...prev,
      reduxSessionCount: reduxSessions.length
    }));
  }, [reduxSessions.length]);

  // Return both Redux and direct API states, plus combined utility functions
  return {
    // Sessions from both sources
    sessions: reduxSessions.length > 0 ? reduxSessions : localSessions,
    reduxSessions,
    localSessions,
    
    // Session selection state
    currentSessionId,
    currentModel,
    
    // Status flags
    isDirectFetching,
    directFetchError,
    lastSyncTimestamp,
    debugInfo,
    
    // Combined operations
    loadSessions,
    createNewSession,
    selectSession,
    removeSession,
    clearSessionMessages,
    fetchDirectSessions,
    
    // Original Redux dispatch for other operations
    dispatch
  };
} 