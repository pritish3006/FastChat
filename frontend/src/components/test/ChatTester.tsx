import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AppDispatch, RootState } from '@/lib/store';
import {
  fetchSessions,
  createSession,
  deleteSession,
  clearSession,
  sendMessage,
  setCurrentSession,
  updateCurrentModel,
  setError,
  resetSessions,
  addMessage,
  updateMessage,
} from '@/lib/store/slices/chatSlice';
import { useHybridSessions } from '@/hooks/useHybridSessions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Search,
  MessageSquare,
  Bot,
  Settings,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import type { Message, MessageMetadata } from '@/lib/types/chat';
import { chatService } from '@/lib/services/chat.service';
import { chatAPI } from '@/lib/api/chat/chat.api';
import { eventEmitter } from '@/lib/core/events';
import { configService } from '@/lib/core/config';
import { useModelSelection } from '@/hooks/useModelSelection';
import { Message as NewMessage } from '@/lib/types/chat';

export function ChatTester() {
  const dispatch = useDispatch<AppDispatch>();
  
  // Initialize services
  useEffect(() => {
    // Initialize chat service with dependencies
    chatService.initialize({
      api: chatAPI,
      events: eventEmitter,
      config: configService,
    });
    
    console.log('Chat service initialized with dependencies');
    
    // Cleanup event listeners on unmount
    return () => {
      eventEmitter.removeAllListeners();
    };
  }, []);
  
  // Use the hybrid sessions hook
  const { 
    sessions, 
    reduxSessions,
    localSessions,
    currentSessionId, 
    currentModel,
    debugInfo,
    isDirectFetching,
    directFetchError,
    lastSyncTimestamp,
    loadSessions,
    createNewSession,
    selectSession,
    removeSession,
    clearSessionMessages,
    fetchDirectSessions
  } = useHybridSessions();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [debugTab, setDebugTab] = useState('session');
  const [selectedModel, setSelectedModel] = useState('default');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [testTitle, setTestTitle] = useState('Test Session');
  const [debugMode, setDebugMode] = useState(false);
  
  // Debug reference values
  const renderCount = useRef(0);
  const logsEnabled = useRef(false);
  const lastActionTime = useRef(new Date().getTime());
  
  // Increment render count on each render
  renderCount.current += 1;
  
  // Track component mounts and renders
  useEffect(() => {
    console.log(`🏗️ ChatTester MOUNTED (using Hybrid Sessions)`);
    
    return () => {
      console.log(`🏗️ ChatTester UNMOUNTED`);
    };
  }, []);
  
  // Get other Redux state
  const { isGenerating, error } = useSelector((state: RootState) => {
    return state.chat;
  });

  // Log when sessions array changes
  useEffect(() => {
    console.log(`📋 Sessions array changed in component:`, {
      count: sessions.length,
      ids: sessions.map(s => s.id).slice(0, 3),
      timestamp: new Date().toISOString(),
      source: sessions === reduxSessions ? 'redux' : 'hybrid'
    });
  }, [sessions, reduxSessions]);
  
  // Log when lastSyncTimestamp changes
  useEffect(() => {
    if (lastSyncTimestamp) {
      console.log(`⏰ lastSyncTimestamp changed:`, {
        timestamp: lastSyncTimestamp,
        sessionsCount: sessions.length
      });
    }
  }, [lastSyncTimestamp, sessions.length]);

  // Add effect to track session selection changes
  useEffect(() => {
    if (logsEnabled.current) {
      console.log('Session selection changed:', {
        currentSessionId,
        selectedModel,
        sessionsCount: sessions.length,
        timestamp: new Date().toISOString()
      });
    }
  }, [currentSessionId, selectedModel, sessions.length]);

  // Local state
  const [testMessage, setTestMessage] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Debounce mechanism to prevent excessive API calls
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef(0);
  const DEBOUNCE_INTERVAL = 2000; // 2 seconds minimum between API calls
  
  // Debounced version of handleLoadSessions to prevent API spam
  const debouncedLoadSessions = useCallback(async (force = false) => {
    const now = Date.now();
    // Skip if already loading or if last load was too recent (unless forced)
    if (isLoadingRef.current || (!force && now - lastLoadTimeRef.current < DEBOUNCE_INTERVAL)) {
      console.log('Skipping load sessions - too frequent or already in progress');
      return false;
    }
    
    isLoadingRef.current = true;
    lastLoadTimeRef.current = now;
    
    try {
      return await handleLoadSessions();
    } finally {
      isLoadingRef.current = false;
    }
  }, [/* eslint-disable-line react-hooks/exhaustive-deps */]);

  // Modified handleLoadSessions to add tracking
  const handleLoadSessions = async () => {
    lastActionTime.current = new Date().getTime();
    try {
      if (logsEnabled.current) {
        console.group('📝 Loading Sessions (Hybrid)');
        console.log('Loading sessions at:', new Date().toISOString());
        console.log('Current state before fetch:', {
          reduxSessions: reduxSessions.length,
          localSessions: localSessions.length,
          currentSessionId: currentSessionId,
          currentModel: currentModel,
          lastSyncTimestamp: lastSyncTimestamp
        });
      } else {
        console.log('📝 Loading sessions (hybrid)...');
      }
      
      // Use our hybrid loadSessions function
      const success = await loadSessions(false); // Changed to false to avoid forced refresh by default
      
      if (logsEnabled.current) {
        console.log('Sessions load result:', {
          success,
          reduxSessions: reduxSessions.length,
          localSessions: localSessions.length,
          current: currentSessionId,
        });
      } else {
        console.log(`📝 Hybrid load ${success ? 'succeeded' : 'failed'}, has ${sessions.length} sessions`);
      }
      
      // Store request/response info for debug
      setLastRequest({
        type: 'HYBRID_FETCH_SESSIONS',
        timestamp: new Date().toISOString(),
      });
      
      setLastResponse({
        type: 'HYBRID_FETCH_SESSIONS_RESPONSE',
        data: {
          success,
          count: sessions.length,
          source: debugInfo.lastSuccessSource,
          sessionIds: sessions.map(s => s.id),
        },
        timestamp: new Date().toISOString(),
        timeTaken: new Date().getTime() - lastActionTime.current + 'ms'
      });
      
      if (logsEnabled.current) {
        console.groupEnd();
      }
      
      return success;
    } catch (error: any) {
      console.error('Error in hybrid loadSessions:', error);
      
      setLastResponse({
        type: 'HYBRID_FETCH_SESSIONS_ERROR',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      
      if (logsEnabled.current) {
        console.error('Full error object:', error);
        console.groupEnd();
      }
      
      return false;
    }
  };

  // Add separate effect to monitor sessions and trigger initial load
  useEffect(() => {
    handleLoadSessions();
    // This effect should only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle session creation using hybrid approach
  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    try {
      console.group('Session Creation (Hybrid)');
      console.log('Starting hybrid session creation with model:', selectedModel);

      // Store request for debugging
      const requestData = { 
        title: `Test Chat ${new Date().toLocaleTimeString()}`,
        modelId: selectedModel 
      };
      
      setLastRequest({
        type: 'HYBRID_CREATE_SESSION',
        timestamp: new Date().toISOString(),
        data: requestData
      });

      console.log('Create session request data:', requestData);
      
      // Use our hybrid createNewSession function
      const result = await createNewSession(requestData);
      
      console.log('Hybrid create session response:', result);
      
      // Store response for debugging
      setLastResponse({
        type: 'HYBRID_CREATE_SESSION',
        timestamp: new Date().toISOString(),
        data: result,
        status: result.success ? 'success' : 'error'
      });
      
      if (result.success && result.sessionId) {
        // Set the newly created session as current using hybrid system
        console.log('Session created successfully with ID:', result.sessionId);
        console.log('Source:', result.source);
        
        // Use the hybrid system's selectSession
        selectSession(result.sessionId);
        
        // Log the session selection
        console.log('Selected new session:', {
          sessionId: result.sessionId,
          currentSessionId,
          timestamp: new Date().toISOString()
        });
        
        toast.success(`Session created and selected successfully with ${selectedModel} (${result.source})`);
      } else {
        toast.error(`Failed to create session: ${result.error || 'Unknown error'}`);
      }
      
      console.groupEnd();
    } catch (error: any) {
      console.error('Failed to create session:', error);
      toast.error(`Failed to create session: ${error.message}`);
      
      // Update debug info with error
      setLastResponse({
        type: 'HYBRID_CREATE_SESSION',
        timestamp: new Date().toISOString(),
        error: error.message,
        status: 'error'
      });
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Handle clearing a session's messages using hybrid approach
  const handleClearSession = async (sessionId: string) => {
    if (logsEnabled.current) {
      console.group('🧹 Clear Session Messages (Hybrid)');
      console.log('Clearing messages for session:', sessionId);
      console.time('Clear session');
    }
    
    setLastRequest({
      type: 'HYBRID_CLEAR_SESSION',
      timestamp: new Date().toISOString(),
      sessionId: sessionId
    });
    
    try {
      const result = await clearSessionMessages(sessionId);
      
      if (result.success) {
        toast.success(`Session messages cleared (${result.source})`);
        setLastResponse({
          type: 'HYBRID_CLEAR_SESSION_SUCCESS',
          timestamp: new Date().toISOString(),
          data: {
            sessionId,
            source: result.source
          }
        });
      } else {
        toast.error(`Failed to clear session: ${result.error}`);
        setLastResponse({
          type: 'HYBRID_CLEAR_SESSION_ERROR',
          timestamp: new Date().toISOString(),
          error: result.error
        });
      }
      
      if (logsEnabled.current) {
        console.log('Clear session result:', result);
        console.timeEnd('Clear session');
        console.groupEnd();
      }
    } catch (error: any) {
      toast.error(`Failed to clear session: ${error.message}`);
      console.error('Failed to clear session:', error);
      setLastResponse({
        type: 'HYBRID_CLEAR_SESSION_ERROR',
        timestamp: new Date().toISOString(),
        error: error.message
      });
      
      if (logsEnabled.current) {
        console.error('Full error:', error);
        console.timeEnd('Clear session');
        console.groupEnd();
      }
    }
  };

  // Handle deleting a session using hybrid approach
  const handleDeleteSession = async (sessionId: string) => {
    if (logsEnabled.current) {
      console.group('🗑️ Delete Session (Hybrid)');
      console.log('Deleting session:', sessionId);
      console.time('Delete session');
    }
    
    setLastRequest({
      type: 'HYBRID_DELETE_SESSION',
      timestamp: new Date().toISOString(),
      sessionId: sessionId
    });
    
    try {
      const result = await removeSession(sessionId);
      
      if (result.success) {
        toast.success(`Session deleted (${result.source})`);
        setLastResponse({
          type: 'HYBRID_DELETE_SESSION_SUCCESS',
          timestamp: new Date().toISOString(),
          data: {
            sessionId,
            source: result.source
          }
        });
      } else {
        toast.error(`Failed to delete session: ${result.error}`);
        setLastResponse({
          type: 'HYBRID_DELETE_SESSION_ERROR',
          timestamp: new Date().toISOString(),
          error: result.error
        });
      }
      
      if (logsEnabled.current) {
        console.log('Delete session result:', result);
        console.timeEnd('Delete session');
        console.groupEnd();
      }
    } catch (error: any) {
      toast.error(`Failed to delete session: ${error.message}`);
      console.error('Failed to delete session:', error);
      
      setLastResponse({
        type: 'HYBRID_DELETE_SESSION_ERROR',
        timestamp: new Date().toISOString(),
        error: error.message
      });
      
      if (logsEnabled.current) {
        console.error('Full error:', error);
        console.timeEnd('Delete session');
        console.groupEnd();
      }
    }
  };

  // Force synchronize the Redux state with backend using hybrid approach
  const syncReduxState = async () => {
    if (logsEnabled.current) {
      console.group('🔄 Force Hybrid Sync');
      console.log('Starting forced hybrid sync at:', new Date().toISOString());
      console.time('Hybrid sync');
    }
    
    toast.info('Forcing hybrid state synchronization...');
    setLastRequest({
      type: 'HYBRID_FORCE_SYNC',
      timestamp: new Date().toISOString(),
    });
    
    try {
      // Reset the Redux state first to clear any stale data
      dispatch(resetSessions());
      
      // Short delay to allow the state to reset
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // First, try direct API fetch
      toast.info('Fetching sessions directly from API...');
      const directSessions = await fetchDirectSessions(true);
      
      // Then reload using our hybrid approach
      const success = await loadSessions(true);
      
      // Store response for debugging
      setLastResponse({
        type: 'HYBRID_FORCE_SYNC_SUCCESS',
        timestamp: new Date().toISOString(),
        data: {
          success,
          directSessions: directSessions?.length || 0,
          hybridSessions: sessions.length,
          currentSessionId,
          selectedModel
        }
      });
      
      toast.success(`Hybrid sync complete: ${success ? 'Success' : 'Failed'}, ${sessions.length} sessions available`);
      
      if (logsEnabled.current) {
        console.log('Hybrid sync results:', {
          success,
          directSessions: directSessions?.length || 0,
          hybridSessions: sessions.length,
          source: debugInfo.lastSuccessSource,
          currentSessionId,
          selectedModel
        });
        console.timeEnd('Hybrid sync');
        console.groupEnd();
      }
      
      return success;
    } catch (error: any) {
      console.error('Error in hybrid sync:', error);
      toast.error(`Hybrid sync failed: ${error.message}`);
      
      setLastResponse({
        type: 'HYBRID_FORCE_SYNC_ERROR',
        timestamp: new Date().toISOString(),
        error: error.message
      });
      
      if (logsEnabled.current) {
        console.error('Full error:', error);
        console.timeEnd('Hybrid sync');
        console.groupEnd();
      }
      
      return false;
    }
  };

  // Debug panel content
  const renderDebugPanel = () => {
    return (
      <Card className="p-4 mt-4">
        <Tabs defaultValue={debugTab} onValueChange={setDebugTab}>
          <TabsList>
            <TabsTrigger value="session">Current Session</TabsTrigger>
            <TabsTrigger value="sessions">All Sessions</TabsTrigger>
            <TabsTrigger value="request">Last Request</TabsTrigger>
            <TabsTrigger value="response">Last Response</TabsTrigger>
            <TabsTrigger value="debug">Debug Controls</TabsTrigger>
          </TabsList>
          
          <TabsContent value="session">
            <div className="space-y-2">
              <h4 className="font-medium">Current Session</h4>
              {currentSessionId ? (
                <pre className="bg-muted p-2 rounded-md text-sm overflow-auto">
                  {JSON.stringify(sessions.find(s => s.id === currentSessionId), null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No session selected</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sessions">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">All Sessions ({sessions.length})</h4>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => debouncedLoadSessions(true)}
                >
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refresh
                </Button>
              </div>
              
              {sessions.length > 0 ? (
                <pre className="bg-muted p-2 rounded-md text-sm overflow-auto max-h-80">
                  {JSON.stringify(sessions, null, 2)}
                </pre>
              ) : (
                <div className="p-4 bg-muted rounded-md text-muted-foreground text-center">
                  <p className="font-medium">No sessions found in Redux store</p>
                  <p className="text-xs mt-1 mb-3">
                    This can happen if the Redux state is out of sync with the backend. 
                    Try refreshing or resetting the sessions state.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => debouncedLoadSessions(true)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refresh
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={debouncedCreateSession}
                    >
                      Create Test Session
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={debouncedClearStorage}
                    >
                      Reset State
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-md text-xs text-yellow-800 dark:text-yellow-400">
                <h5 className="font-semibold">Session Debug Info:</h5>
                <p>Current model: {currentModel}</p>
                <p>Selected model: {selectedModel}</p>
                <p>Current sessionId: {currentSessionId || 'none'}</p>
                <p>Last sync: {lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleString() : 'Never'}</p>
                <div className="mt-2 pt-2 border-t border-yellow-200 dark:border-yellow-700">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={debouncedClearStorage}
                    className="w-full h-6 text-xs text-yellow-800 bg-yellow-100 hover:bg-yellow-200 dark:text-yellow-300 dark:bg-yellow-900/40"
                  >
                    Reset State
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="request">
            <div className="space-y-2">
              <h4 className="font-medium">Last Request</h4>
              {lastRequest ? (
                <pre className="bg-muted p-2 rounded-md text-sm overflow-auto">
                  {JSON.stringify(lastRequest, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No recent requests</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="response">
            <div className="space-y-2">
              <h4 className="font-medium">Last Response</h4>
              {lastResponse ? (
                <pre className="bg-muted p-2 rounded-md text-sm overflow-auto">
                  {JSON.stringify(lastResponse, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No recent responses</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="debug">
            <div className="space-y-3">
              <h4 className="font-medium">Debug Controls</h4>
              
              <div className="flex flex-col gap-2">
                <Card className="p-3 bg-slate-50 dark:bg-slate-900">
                  <h5 className="text-sm font-medium mb-2">Session Diagnostics</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        console.clear();
                        console.log('🧹 Console cleared, fetching fresh session data...');
                        try {
                          const result = await dispatch(fetchSessions()).unwrap();
                          toast.success(`Fetched ${result.length} sessions`);
                        } catch (error: any) {
                          toast.error(`Error: ${error.message}`);
                        }
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-2" />
                      Clear Console & Refresh
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        console.group('🔍 Current Redux State Snapshot');
                        console.log('Current time:', new Date().toISOString());
                        console.log('Sessions in Redux:', sessions);
                        console.log('Sessions count:', sessions.length);
                        console.log('Current Session ID:', currentSessionId);
                        console.log('Selected model:', selectedModel);
                        console.log('Redux model:', currentModel);
                        console.log('Last sync timestamp:', lastSyncTimestamp);
                        console.groupEnd();
                        toast.info('Redux state snapshot logged to console');
                      }}
                    >
                      <Info className="h-3 w-3 mr-2" />
                      Log Redux State
                    </Button>
                  </div>
                </Card>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                    <h5 className="text-sm font-medium mb-1">Session Stats</h5>
                    <p className="text-xs">Total Sessions: {sessions.length}</p>
                    <p className="text-xs">Last Sync: {lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Never'}</p>
                    <p className="text-xs">Selected Session: {currentSessionId?.substring(0, 8) || 'None'}</p>
                  </div>
                  
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                    <h5 className="text-sm font-medium mb-1">Component Stats</h5>
                    <p className="text-xs">Render Count: {renderCount.current}</p>
                    <p className="text-xs">Component State: {isCreatingSession ? 'Creating Session' : 'Idle'}</p>
                    <p className="text-xs">Last Action: {lastRequest?.type || 'None'}</p>
                  </div>
                </div>
                
                <Card className="p-3 bg-slate-50 dark:bg-slate-900">
                  <h5 className="text-sm font-medium mb-2">Debug Options</h5>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="debug-mode"
                        checked={logsEnabled.current}
                        onCheckedChange={(checked) => {
                          logsEnabled.current = checked;
                          if (checked) {
                            toast.info('Detailed logging enabled');
                            console.log('🔍 Detailed logging ENABLED');
                          } else {
                            toast.info('Detailed logging disabled');
                            console.log('🔍 Detailed logging DISABLED');
                          }
                        }}
                      />
                      <Label htmlFor="debug-mode" className="text-sm cursor-pointer">
                        Enable detailed logging
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={debouncedClearStorage}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Reset State
                    </Button>
                  </div>
                </Card>
                
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      // Using our debounced session creation to prevent duplication
                      if (isCreatingSession) {
                        console.log('Already creating a session, please wait...');
                        toast.info('Session creation in progress, please wait');
                        return;
                      }
                      
                      setIsCreatingSession(true);
                      setLastRequest({
                        type: 'CREATE_DEBUG_SESSION',
                        timestamp: new Date().toISOString(),
                      });
                      
                      // Use hybrid approach with session model included from the start
                      createNewSession({
                        title: `Debug Session ${new Date().toLocaleTimeString()}`,
                        modelId: selectedModel
                      })
                        .then((result) => {
                          console.log('✅ Debug session created:', result);
                          toast.success('Debug session created successfully');
                          setLastResponse({
                            type: 'CREATE_DEBUG_SESSION_SUCCESS',
                            data: result,
                            timestamp: new Date().toISOString(),
                          });
                          
                          // No need to force refresh since the createNewSession will update Redux state
                        })
                        .catch((err) => {
                          console.error('❌ Debug session creation failed:', err);
                          toast.error(`Debug session creation failed: ${err.message}`);
                          setLastResponse({
                            type: 'CREATE_DEBUG_SESSION_ERROR',
                            error: err.message,
                            timestamp: new Date().toISOString(),
                          });
                        })
                        .finally(() => {
                          setIsCreatingSession(false);
                        });
                    }}
                  >
                    <Bot className="h-3 w-3 mr-2" />
                    Create Debug Session
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    );
  };

  // Sessions panel content
  const renderSessionsPanel = () => {
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex gap-2 items-center">
            <h2 className="text-lg font-semibold">Sessions</h2>
            <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800">
              {sessions.length}
            </Badge>
            {sessions !== reduxSessions && (
              <Badge variant="outline" className="ml-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                Hybrid
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              title="Force refresh sessions list using hybrid approach"
              onClick={() => debouncedLoadSessions(true)}
              disabled={loading || isDirectFetching}
            >
              {isDirectFetching ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={debouncedCreateSession}
              disabled={isCreatingSession}
            >
              {isCreatingSession ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-1" />
                  New Session
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* Debug buttons when no sessions */}
        {sessions.length === 0 && (
          <Card className="p-4 mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <div className="flex flex-col gap-3">
              <p className="font-medium">No sessions found in either Redux store or direct API.</p>
              <p className="text-sm text-muted-foreground">
                This could happen if both the Redux state is out of sync with the backend, or if there are no sessions.
                Try these options:
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => debouncedLoadSessions(true)}>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Hybrid Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={debouncedCreateSession}>
                  <MessageSquare className="h-3 w-3 mr-2" />
                  Create Test Session
                </Button>
                <Button variant="outline" size="sm" onClick={() => fetchDirectSessions(true)}>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Direct API Fetch
                </Button>
                <Button variant="outline" size="sm" onClick={debouncedClearStorage}>
                  <Trash2 className="h-3 w-3 mr-2" />
                  Reset State
                </Button>
              </div>
            </div>
          </Card>
        )}
        
        {/* Display sessions if available */}
        {sessions.length > 0 && (
          <Card className="p-4">
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`p-3 rounded-md flex items-center justify-between hover:bg-accent/50 transition-colors ${
                      currentSessionId === session.id ? 'bg-accent' : 'bg-background border border-border'
                    }`}
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => selectSession(session.id)}
                    >
                      <p className="font-medium">{session.title || 'Untitled'}</p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center">
                          <MessageSquare className="h-3 w-3 mr-1" />
                          {session.messageCount || 0}
                        </span>
                        <span>•</span>
                        <span className="flex items-center">
                          {session.modelId === 'gpt-4o-mini' ? (
                            <>
                              <Bot className="h-3 w-3 mr-1" />
                              <span className="font-medium">{session.modelId}</span>
                              <Badge variant="outline" className="ml-1 text-xs">Agent</Badge>
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-3 w-3 mr-1" />
                              <span>{session.modelId}</span>
                            </>
                          )}
                        </span>
                        <span>•</span>
                        <span className="flex items-center text-xs">
                          Created: {new Date(session.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleClearSession(session.id)}
                        title="Clear messages"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSession(session.id)}
                        title="Delete session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}
      </div>
    );
  };

  // Add the useModelSelection hook near the top with other hooks
  const { models, selectedModel: hookSelectedModel, isLoading: isModelsLoading, handleModelChange } = useModelSelection();

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!currentSessionId) {
      toast.error('Please select a session first');
      return;
    }

    if (!testMessage.trim()) {
      toast.error('Please enter a message');
      return;
    }

    try {
      // Check if using an agent model
      const isAgentModel = selectedModel === 'gpt-4o-mini';
      
      // Store request for debugging
      setLastRequest({
        type: 'SEND_MESSAGE',
        timestamp: new Date().toISOString(),
        data: {
          content: testMessage,
          sessionId: currentSessionId,
          modelId: selectedModel,
          isAgentModel
        }
      });

      // Display toast with information about which endpoint is being used
      toast.info(`Sending to ${isAgentModel ? 'agent' : 'chat'} endpoint...`);
      
      // Clear the input immediately after sending
      setTestMessage('');
      
      // Send message through chat service
      await chatService.sendMessage(testMessage);
      
      // Store response for debugging
      setLastResponse({
        type: 'MESSAGE_SENT',
        timestamp: new Date().toISOString(),
        status: 'success'
      });
      
      toast.success('Message sent successfully');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(`Failed to send message: ${error.message}`);
      
      setLastResponse({
        error: error.message,
        timestamp: new Date().toISOString(),
        status: 'error'
      });
    }
  };

  // Clear localStorage and reset state
  const handleClearStorage = () => {
    lastActionTime.current = new Date().getTime();
    if (logsEnabled.current) {
      console.group('🧹 Clearing Storage');
      console.log('Started clearing local storage at:', new Date().toISOString());
    }

    try {
      // Set request for debugging
      setLastRequest({
        type: 'CLEAR_STORAGE',
        timestamp: new Date().toISOString(),
        targets: ['localStorage.chatState', 'redux.sessions']
      });
      
      // Clear from localStorage
      window.localStorage.removeItem('chatState');
      window.localStorage.removeItem('persist:chat');
      
      if (logsEnabled.current) {
        console.log('Cleared localStorage items:', ['chatState', 'persist:chat']);
        console.log('Current localStorage keys:', Object.keys(window.localStorage));
      }
      
      // Show success message
      toast.success('Local storage cleared');
      
      // Reset Redux state
      setTimeout(() => {
        dispatch(resetSessions());
        
        if (logsEnabled.current) {
          console.log('Dispatched resetSessions action');
        }
        
        toast.info('Sessions reset, reloading data...');
        
        // Re-fetch sessions after reset
        setTimeout(() => {
          handleLoadSessions()
            .then(success => {
              setLastResponse({
                type: 'CLEAR_STORAGE_COMPLETE',
                timestamp: new Date().toISOString(),
                result: {
                  success,
                  sessionsCount: sessions.length,
                  timeTaken: new Date().getTime() - lastActionTime.current + 'ms'
                }
              });
              
              if (logsEnabled.current) {
                console.log('Re-loaded sessions after reset:', {
                  success,
                  count: sessions.length,
                  source: debugInfo.lastSuccessSource
                });
                console.groupEnd();
              }
            });
        }, 500);
      }, 200);
    } catch (error: any) {
      console.error('Failed to clear storage:', error);
      toast.error(`Error clearing storage: ${error.message}`);
      
      setLastResponse({
        type: 'CLEAR_STORAGE_ERROR',
        timestamp: new Date().toISOString(),
        error: error.message
      });
      
      if (logsEnabled.current) {
        console.error('Full error:', error);
        console.groupEnd();
      }
    }
  };

  // Debounced version of handleClearStorage to prevent API spam
  const debouncedClearStorage = useCallback(() => {
    const now = Date.now();
    // Skip if called too frequently
    if (now - lastActionTime.current < DEBOUNCE_INTERVAL) {
      console.log('Skipping clear storage - called too recently');
      toast.info('Please wait a moment before trying again');
      return;
    }
    
    handleClearStorage();
  }, [handleClearStorage]);

  // Debounced version of handleCreateSession to prevent API spam
  const debouncedCreateSession = useCallback(() => {
    const now = Date.now();
    // Skip if already creating or if last creation was too recent
    if (isCreatingSession || now - lastActionTime.current < DEBOUNCE_INTERVAL) {
      console.log('Skipping create session - already in progress or called too recently');
      toast.info('Please wait a moment before creating another session');
      return;
    }
    
    handleCreateSession();
  }, [isCreatingSession, handleCreateSession]);

  // Debounced version of handleSendMessage to prevent API spam
  const debouncedSendMessage = useCallback(() => {
    const now = Date.now();
    // Skip if generating or if last message was too recent
    if (isGenerating || now - lastActionTime.current < DEBOUNCE_INTERVAL) {
      console.log('Skipping send message - already generating or called too recently');
      toast.info('Please wait a moment before sending another message');
      return;
    }
    
    handleSendMessage();
  }, [isGenerating, handleSendMessage]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Chat Tester</h2>
        <div className="flex items-center gap-4">
          <Switch
            checked={showDebug}
            onCheckedChange={setShowDebug}
            id="debug-mode"
          />
          <label htmlFor="debug-mode" className="text-sm">Debug Mode</label>
          {lastSyncTimestamp && (
            <p className="text-sm text-gray-500">
              Last synced: {new Date(lastSyncTimestamp).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Debug Status Banner */}
      {showDebug && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-md text-sm text-blue-800 dark:text-blue-300">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Debug Status</h3>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={syncReduxState}
                className="h-7 px-2 py-1 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Force Sync
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={debouncedClearStorage}
                className="h-7 px-2 py-1 text-xs"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Reset State
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => debouncedLoadSessions(true)}
                className="h-7 px-2 py-1 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <p><span className="font-medium">Sessions:</span> {sessions.length}</p>
              <p><span className="font-medium">Current Session:</span> {currentSessionId || 'None'}</p>
              <p><span className="font-medium">Selected Model:</span> {selectedModel}</p>
            </div>
            <div>
              <p><span className="font-medium">Redux Model:</span> {currentModel}</p>
              <p><span className="font-medium">Last Action:</span> {lastRequest?.type || 'None'}</p>
              <p><span className="font-medium">Generation:</span> {isGenerating ? 'In Progress' : 'Idle'}</p>
            </div>
          </div>
          
          {/* Enhanced Sessions Debug */}
          <div className="mt-3 p-2 bg-white/50 dark:bg-slate-900/50 rounded-md border border-blue-100 dark:border-blue-800">
            <h4 className="font-medium text-xs mb-1">Redux Sessions State</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs">
                  <span className="font-medium">Count:</span> {sessions.length} 
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800 rounded text-[10px]">
                    {sessions.length > 0 ? 'Has Sessions' : 'Empty'}
                  </span>
                </p>
                <p className="text-xs">
                  <span className="font-medium">First Session ID:</span> {sessions[0]?.id || 'None'}
                </p>
              </div>
              <div>
                <p className="text-xs">
                  <span className="font-medium">Last Sync:</span> {lastSyncTimestamp ? new Date(lastSyncTimestamp).toLocaleTimeString() : 'Never'}
                </p>
                <button 
                  onClick={() => console.log('Current Redux Sessions:', sessions)} 
                  className="text-xs underline"
                >
                  Log Sessions to Console
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Models Section */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-2">Models</h3>
        <div className="flex gap-2 flex-wrap">
          {isModelsLoading ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading models...</span>
            </div>
          ) : (
            models.map((model) => (
              <Button
                key={model.id}
                variant={selectedModel === model.id ? 'default' : 'outline'}
                onClick={() => {
                  // Update local state for UI
                  setSelectedModel(model.id);
                  // Use the hook's handler for the actual update
                  handleModelChange(model.id);
                  // Store debug info
                  setLastRequest({ 
                    action: 'updateModel',
                    modelId: model.id,
                    currentSessionId,
                    timestamp: new Date().toISOString()
                  });
                }}
                className="flex items-center gap-2"
              >
                {model.id === 'gpt-4o-mini' ? <Bot className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                {model.name}
                {model.id === 'gpt-4o-mini' && (
                  <Badge variant="secondary" className="ml-2">Agent</Badge>
                )}
              </Button>
            ))
          )}
        </div>
        
        {selectedModel === 'gpt-4o-mini' && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={useSearch}
                onCheckedChange={setUseSearch}
                id="use-search"
              />
              <label htmlFor="use-search" className="text-sm">Enable Web Search</label>
            </div>
          </div>
        )}
      </Card>

      {/* Sessions Section */}
      {renderSessionsPanel()}

      {/* Messages Section */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-2">Messages</h3>
        {currentSessionId ? (
          <div className="space-y-4">
            <ScrollArea className="h-48 mb-4">
              {sessions
                .find((s) => s.id === currentSessionId)
                ?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-2 ${
                      message.role === 'user' ? 'bg-accent' : 'bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{message.role}</p>
                      {message.metadata?.useSearch && (
                        <Badge variant="outline" className="text-xs">
                          <Search className="h-3 w-3 mr-1" />
                          Web Search
                        </Badge>
                      )}
                    </div>
                    <p>{message.content}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(message.createdAt).toLocaleString()}
                    </p>
                    {showDebug && message.metadata && (
                      <pre className="mt-2 text-xs bg-muted p-2 rounded">
                        {JSON.stringify(message.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
            </ScrollArea>
            <div className="space-y-2">
              <Textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Type a message..."
                disabled={isGenerating}
              />
              <Button
                onClick={debouncedSendMessage}
                disabled={!testMessage.trim() || isGenerating}
                className="w-full"
              >
                Send Message
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Select a session to view messages</p>
        )}
      </Card>

      {/* Debug Panel */}
      {showDebug && renderDebugPanel()}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
} 