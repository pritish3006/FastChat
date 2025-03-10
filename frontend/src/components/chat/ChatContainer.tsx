/**
 * chat container - the main message display area
 * 
 * what it does:
 * - renders all messages with proper animations
 * - handles scrolling behavior & auto-scroll
 * - displays scroll-to-bottom button when needed
 * - blurs messages during editing
 * - manages branch point navigation
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import UserMessage from './UserMessage';
import BotMessage from './BotMessage';
import MessageInput from './MessageInput';
import ErrorMessage from './ErrorMessage';
import { motion, AnimatePresence } from 'framer-motion';
import { Message } from '@/types';
import webSocketManager from '@/utils/webSocket';
import { ChevronDown } from 'lucide-react';
import { IconButton, Tooltip } from '@mui/material';

const ChatContainer: React.FC = () => {
  // initialize redux dispatch
  const dispatch = useDispatch();

  // get chat state from redux store
  const {
    sessions,
    currentSessionId,
    isGenerating,
    editingMessageId,
    activeBranchId,
    currentBranchIndex
  } = useSelector((state: RootState) => state.chat);

  // ref for auto-scrolling to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // state to track if we should show the scroll-to-bottom button
  const [showScrollButton, setShowScrollButton] = useState(false);
  // track if user has manually scrolled up
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  // find current chat session and its messages
  const currentSession = sessions.find(session => session.id === currentSessionId);
  
  // get either main thread messages or branch messages based on active branch
  let messages: Message[] = [];
  
  if (currentSession) {
    if (activeBranchId) {
      // display messages from the active branch
      const branch = currentSession.branches.find(b => b.id === activeBranchId);
      if (branch) {
        messages = branch.messages;
      } else {
        // fallback to main thread if branch not found
        messages = currentSession.messages;
      }
    } else {
      // display main thread messages
      messages = currentSession.messages;
    }
  }

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
    
    // hide the button after scrolling to bottom
    setShowScrollButton(false);
    setUserHasScrolled(false);
  }, []);
  
  /**
   * handle scroll events to show/hide the scroll button
   */
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const isBottom = isAtBottom();
    
    // track if user has scrolled up
    if (!isBottom) {
      setUserHasScrolled(true);
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
      
      // reset user scroll flag if they scrolled back to bottom
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
    // if user hasn't manually scrolled up or if we're generating, scroll to bottom
    if (!userHasScrolled || isGenerating) {
      scrollToBottom();
    } else if (isGenerating) {
      // always show scroll button when generating but user has scrolled
      setShowScrollButton(true);
    }
  }, [messages.length, scrollToBottom, userHasScrolled, isGenerating]);
  
  /**
   * effect to handle when generation finishes
   */
  useEffect(() => {
    // when generation stops and user hasn't scrolled, scroll to bottom
    if (!isGenerating && !userHasScrolled) {
      scrollToBottom();
    }
  }, [isGenerating, scrollToBottom, userHasScrolled]);

  // find the index of the last user message
  const getLastUserMessageIndex = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return i;
      }
    }
    return -1;
  };

  const lastUserMessageIndex = getLastUserMessageIndex();
  
  // determine which message is being edited
  const getEditingMessageIndex = () => {
    if (!editingMessageId) return -1;
    return messages.findIndex(m => m.id === editingMessageId);
  };
  
  const editingMessageIndex = getEditingMessageIndex();
  
  // find if we have a branch point in this message thread
  const branchPointIndex = currentSession?.messages.findIndex(m => m.branch_point) ?? -1;
  const hasBranches = branchPointIndex !== -1 && currentSession?.branches.length > 0;

  // render empty state when no messages exist
  if (messages.length === 0) {
    return <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <motion.div 
            className="max-w-lg text-center px-4" 
            initial={{
              opacity: 0,
              y: 20
            }} 
            animate={{
              opacity: 1,
              y: 0
            }} 
            transition={{
              duration: 0.5
            }}
          >
            <h2 className="text-2xl font-semibold mb-3">How can I help you today?</h2>
            <p className="text-muted-foreground">
              Ask me anything, from answering questions to generating content and helping with tasks.
            </p>
          </motion.div>
        </div>
        <MessageInput />
      </div>;
  }

  // render chat messages with animations
  return <div className="flex flex-col h-full">
      {/* scrollable message container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#eef3f3] bg-[414549] relative"
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {/* animate message presence/absence */}
          <AnimatePresence initial={false}>
            {/* map through and render each message */}
            {messages.map((message: Message, index: number) => {
              const isUser = message.role === 'user';
              const isLastUserMessage = index === lastUserMessageIndex;
              const isEditing = message.id === editingMessageId;
              const isBranchPoint = message.branch_point;
              
              // create classes for blur effect when in edit mode
              // when editing, blur everything except the message being edited
              const messageClasses = editingMessageId 
                ? isEditing 
                  ? 'opacity-100' 
                  : 'opacity-30 blur-[1px]'
                : '';
              
              return <motion.div 
                key={message.id} 
                initial={{
                  opacity: 0,
                  y: 20
                }} 
                animate={{
                  opacity: 1,
                  y: 0
                }} 
                exit={{
                  opacity: 0,
                  y: -20
                }} 
                transition={{
                  duration: 0.3
                }} 
                className={`mb-6 transition-all duration-200 ${messageClasses}`}
              >
                  {/* render appropriate message component based on role and error state*/}
                  {message.is_error ? (
                    <ErrorMessage message={message} />) : 
                    isUser ? (
                    <UserMessage 
                      message={message} 
                      isLastUserMessage={isLastUserMessage}
                      isBranchPoint={isBranchPoint}
                      hasBranches={message.branch_point && hasBranches}
                      branchIndex={currentBranchIndex}
                      totalBranches={currentSession?.branches.filter(b => b.parentMessageId === message.id).length + 1 || 0}
                    />) : 
                    <BotMessage 
                      message={message} 
                      isLastMessage={index === messages.length - 1} 
                    />
                  }
                </motion.div>;
            })}
          </AnimatePresence>
          {/* invisible element for scroll anchoring */}
          <div ref={messagesEndRef} />
        </div>
        
        {/* scroll to bottom button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.div 
              className="absolute bottom-6 right-6 z-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <Tooltip title="Scroll to latest message">
                <IconButton 
                  onClick={scrollToBottom}
                  size="large"
                  className="bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                  sx={{ 
                    boxShadow: 3,
                    backgroundColor: 'rgb(59, 130, 246)', // blue-500
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(59, 130, 246, 0.9)',
                    }
                  }}
                >
                  <ChevronDown />
                </IconButton>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* message input component */}
      <MessageInput />
    </div>;
};

export default ChatContainer;