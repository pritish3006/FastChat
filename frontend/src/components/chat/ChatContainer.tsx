/**
 * chat container - the main message display area
 * 
 * what it does:
 * - renders all messages with proper animations
 * - handles scrolling behavior & auto-scroll
 * - displays scroll-to-bottom button when needed
 * - blurs messages during editing
 * - manages branch point navigation
 * - displays session information and health status
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { Message } from '@/lib/types/chat';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LlamaChat } from './LlamaChat';
import { ErrorMessage } from './ErrorMessage';
import { SessionInfo } from './SessionInfo';
import { toast } from 'sonner';

const ChatContainer: React.FC = () => {
  // initialize redux dispatch
  const dispatch = useAppDispatch();

  // get chat state from redux store
  const {
    sessions,
    currentSessionId,
    isGenerating,
    editingMessageId,
    error
  } = useAppSelector(state => state.chat);

  // ref for auto-scrolling to bottom of messages
  const containerRef = useRef<HTMLDivElement>(null);
  
  // state to track if we should show the scroll-to-bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);
  // track if user has manually scrolled up
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  // find current chat session and its messages
  const currentSession = sessions.find(session => session.id === currentSessionId);
  const messages = currentSession?.messages || [];

  // Show error toast if there's an error
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  /**
   * check if the chat is scrolled to the bottom
   */
  const isAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;
    
    const threshold = 100; // allow a small threshold to still be considered "at bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  /**
   * smoothly scrolls chat container to bottom
   */
  const scrollToBottom = useCallback(() => {
    if (!containerRef.current) return;
    
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: 'smooth'
    });
    
    setShowScrollButton(false);
    setUserHasScrolled(false);
  }, []);
  
  /**
   * handle scroll events to show/hide the scroll button
   */
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const isBottom = isAtBottom();
    
    if (!isBottom) {
      setUserHasScrolled(true);
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
      if (userHasScrolled) {
        setUserHasScrolled(false);
      }
    }
  }, [isAtBottom, userHasScrolled]);
  
  /**
   * initialize scroll event listener
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);
  
  /**
   * auto-scroll effect for new messages
   */
  useEffect(() => {
    if (!userHasScrolled || isGenerating) {
      scrollToBottom();
    } else if (isGenerating) {
      setShowScrollButton(true);
    }
  }, [messages.length, scrollToBottom, userHasScrolled, isGenerating]);

  // render empty state when no messages exist
  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <motion.div 
            className="max-w-lg text-center px-4" 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <h2 className="text-2xl font-semibold mb-3">How can I help you today?</h2>
            <p className="text-muted-foreground">
              Ask me anything, from answering questions to generating content and helping with tasks.
            </p>
          </motion.div>
        </div>
        <LlamaChat />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Session information panel */}
      <div className="mb-4">
        <SessionInfo />
      </div>
      
      {/* Message container */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea 
          ref={containerRef}
          className="flex-1 overflow-y-auto bg-background relative"
        >
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4 p-4">
              <AnimatePresence mode="popLayout" initial={false}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ 
                      duration: 0,  // Instant load for existing messages
                      ease: [0.2, 0, 0.2, 1]
                    }}
                  >
                    {message.is_error ? (
                      <ErrorMessage 
                        message={message}
                        onRetry={() => {
                          // Retry logic will be implemented in the next phase
                          toast.info('Retry functionality coming soon');
                        }}
                      />
                    ) : (
                      <div 
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div 
                          className={`max-w-[80%] rounded-lg p-4 ${
                            message.role === 'user' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          } ${editingMessageId === message.id ? 'opacity-50' : ''}`}
                        >
                          {message.content}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </ScrollArea>
        
        <LlamaChat />
        
        <AnimatePresence>
          {showScrollButton && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                size="icon"
                variant="secondary"
                className="fixed bottom-24 right-4 rounded-full shadow-lg"
                onClick={scrollToBottom}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChatContainer;