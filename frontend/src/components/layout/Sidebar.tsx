import React from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { createSession, setCurrentSession } from '@/lib/store/slices/chatSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, MessageCircle, Trash2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

const Sidebar: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const {
    sessions,
    currentSessionId,
    currentModel
  } = useAppSelector(state => state.chat);

  const handleNewChat = async () => {
    try {
      // Create new session with current model (will use default from state)
      const result = await dispatch(createSession({ 
        // No need to explicitly pass modelId as our updated thunk will use the current model
        title: 'New Chat' 
      })).unwrap();
      
      if (!result || !result.id) {
        throw new Error('Failed to create new session');
      }

      // Navigate to /chat first, let the Chat component handle the session
      navigate('/chat');
      toast.success('Started new chat session');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast.error('Failed to create new chat session');
    }
  };

  const handleSelectSession = (sessionId: string) => {
    navigate(`/chat/${sessionId}`);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    // Delete session implementation here
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch {
      return 'Unknown date';
    }
  };

  return (
    <div className="h-full w-[260px] border-r flex flex-col bg-background">
      <div className="p-4">
        <Button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2"
          variant="outline"
        >
          <PlusCircle className="h-5 w-5" />
          <span>New Chat</span>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          <AnimatePresence mode="popLayout">
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`
                  group flex items-center gap-2 p-2 rounded-lg cursor-pointer
                  ${currentSessionId === session.id ? 'bg-accent' : 'hover:bg-accent/50'}
                  transition-colors
                `}
                onClick={() => handleSelectSession(session.id)}
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">
                      {session.title || 'New Chat'}
                    </p>
                    <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatDate(session.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

export default Sidebar;