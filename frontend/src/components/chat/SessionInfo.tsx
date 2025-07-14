/**
 * SessionInfo Component
 * 
 * Displays current session information and provides health check functionality
 */

import { useCallback, useState } from 'react';
import { useAppSelector } from '@/lib/store/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle, Info, MessageSquare, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI } from '@/lib/api/sessions/sessions.api';

export function SessionInfo() {
  const { currentSessionId, sessions } = useAppSelector(state => state.chat);
  const [isChecking, setIsChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'unchecked' | 'healthy' | 'unhealthy'>('unchecked');
  
  // Find current session details
  const currentSession = sessions.find(s => s.id === currentSessionId);
  
  // Format a timestamp for display
  const formatTime = (timestamp: string | number | undefined) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return isNaN(date.getTime()) 
      ? 'Invalid date' 
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric'
        });
  };
  
  // Perform a session health check
  const checkSessionHealth = useCallback(async () => {
    if (!currentSessionId) {
      toast.error('No active session to check');
      return;
    }
    
    setIsChecking(true);
    setHealthStatus('unchecked');
    
    try {
      // Use the new health check API
      const healthResult = await sessionsAPI.checkSessionHealth(currentSessionId);
      
      if (healthResult.status === 'active') {
        setHealthStatus('healthy');
        toast.success('Session is active and healthy');
      } else if (healthResult.status === 'stale') {
        setHealthStatus('unhealthy');
        toast.warning('Session is stale. It has not been updated in a while.');
      } else {
        setHealthStatus('unhealthy');
        toast.error('Session health check failed. The session may be invalid or deleted.');
      }
    } catch (error) {
      console.error('Session health check failed:', error);
      setHealthStatus('unhealthy');
      toast.error('Session health check failed. The session may be stale or deleted.');
    } finally {
      setIsChecking(false);
    }
  }, [currentSessionId]);
  
  // If no session is active
  if (!currentSession) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">No active session</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="bg-card overflow-hidden">
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Current Session</h3>
              <Badge 
                variant={healthStatus === 'healthy' ? 'success' : healthStatus === 'unhealthy' ? 'destructive' : 'outline'}
                className="text-xs"
              >
                {currentSession.modelId === 'gpt-4o-mini' ? (
                  <Bot className="h-3 w-3 mr-1" />
                ) : (
                  <MessageSquare className="h-3 w-3 mr-1" />
                )}
                {currentSession.modelId || 'Unknown model'}
              </Badge>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2"
              onClick={checkSessionHealth}
              disabled={isChecking || !currentSessionId}
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Checking...
                </>
              ) : healthStatus === 'healthy' ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                  Healthy
                </>
              ) : healthStatus === 'unhealthy' ? (
                <>
                  <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
                  Unhealthy
                </>
              ) : (
                'Check Health'
              )}
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Session ID:</span>
              <code className="bg-muted px-1 rounded text-[10px]">{currentSession.id.substring(0, 8)}...</code>
            </div>
            <div className="flex items-center justify-between">
              <span>Created:</span>
              <span>{formatTime(currentSession.createdAt)}</span>
            </div>
            {currentSession.updatedAt && (
              <div className="flex items-center justify-between">
                <span>Last updated:</span>
                <span>{formatTime(currentSession.updatedAt)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Messages:</span>
              <span>{currentSession.messageCount || currentSession.messages?.length || 0}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 