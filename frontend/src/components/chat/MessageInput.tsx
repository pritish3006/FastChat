/**
 * MessageInput Component
 * 
 * A robust input component for chat messages with features:
 * - Text input with auto-resize
 * - Web search integration
 * - Voice input (planned)
 * - Error handling and loading states
 * - Accessibility support
 * - Throttled API calls to prevent spam
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { sendMessage, setIsGenerating } from '@/lib/store/slices/chatSlice';
import { toggleToolsMenu } from '@/lib/store/slices/uiSlice';
import { toast } from 'sonner';
import { Send, Mic, Search, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createSession } from '@/lib/store/slices/chatSlice';

interface MessageInputProps {
  className?: string;
  onWebSearch?: () => void;
}

export function MessageInput({ className, onWebSearch }: MessageInputProps) {
  const dispatch = useAppDispatch();
  
  // Redux state
  const currentSessionId = useAppSelector(state => state.chat.currentSessionId);
  const currentModel = useAppSelector(state => state.chat.currentModel);
  const isGenerating = useAppSelector(state => state.chat.isGenerating);
  const editingMessageId = useAppSelector(state => state.chat.editingMessageId);

  // Local state
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Throttling mechanism
  const lastActionTime = useRef(0);
  const DEBOUNCE_INTERVAL = 2000; // 2 seconds minimum between API calls

  // Computed state
  const isInputDisabled = Boolean(editingMessageId) || isGenerating;
  const canSendMessage = message.trim().length > 0 && !isInputDisabled;
  const isGPT4Mini = currentModel === 'gpt-4o-mini';
  const isAdvancedFeaturesDisabled = !isGPT4Mini || isInputDisabled;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Original submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSendMessage) return;

    try {
      // Ensure we have a session before sending message
      if (!currentSessionId) {
        const result = await dispatch(createSession({ 
          modelId: currentModel,
          title: 'New Chat'
        })).unwrap();
        
        if (!result || !result.id) {
          throw new Error('Failed to create session');
        }
      }

      const messageData = {
        content: message.trim(),
        sessionId: currentSessionId!,
        modelId: currentModel,
        ...(isGPT4Mini && {
          metadata: {
            useSearch: true,
            modelId: currentModel
          }
        })
      };

      await dispatch(sendMessage(messageData)).unwrap();
      setMessage('');
      
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message');
    }
  };
  
  // Debounced version of handleSubmit to prevent API spam
  const debouncedSubmit = useCallback((e: React.FormEvent) => {
    const now = Date.now();
    
    // Skip if generating or if last message was too recent
    if (isGenerating || now - lastActionTime.current < DEBOUNCE_INTERVAL) {
      toast.info('Please wait a moment before sending another message');
      return;
    }
    
    // Update last action time
    lastActionTime.current = now;
    
    // Call the original handler
    handleSubmit(e);
  }, [isGenerating]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleVoiceRecording = () => {
    // TODO: Implement voice recording
    toast.info('Voice recording coming soon!');
    setIsRecording(!isRecording);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      debouncedSubmit(e);
    }
  };

  const buttonVariants = {
    initial: { scale: 1 },
    hover: { 
      scale: 1.05,
      transition: { duration: 0.2, ease: "easeOut" }
    },
    tap: { 
      scale: 0.95,
      transition: { duration: 0.1 }
    }
  };

  const inputVariants = {
    initial: { scale: 1 },
    focus: { 
      scale: 1.02,
      transition: { duration: 0.2, ease: "easeOut" }
    }
  };

  return (
    <motion.div 
      className={`fixed bottom-0 left-0 right-0 bg-background border-t ${className}`}
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="max-w-4xl mx-auto">
        <form onSubmit={debouncedSubmit} className="p-4">
          <div className="flex items-center gap-2">
            {/* Web Search Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={onWebSearch}
                      disabled={isAdvancedFeaturesDisabled}
                      className={`text-muted-foreground hover:text-foreground ${!isGPT4Mini ? 'opacity-50' : ''}`}
                    >
                      <Search className="h-5 w-5" />
                      <span className="sr-only">Search the web</span>
                    </Button>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isGPT4Mini ? 'Search the web' : 'Web search requires GPT-4o Mini'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Message Input */}
            <motion.div
              className="flex-1"
              variants={inputVariants}
              animate={isFocused ? "focus" : "initial"}
            >
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={isInputDisabled ? "Please wait..." : "Type your message..."}
                disabled={isInputDisabled}
                className="min-h-[60px] max-h-[200px] resize-none"
                aria-label="Message input"
              />
            </motion.div>

            {/* Voice Message Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleVoiceRecording}
                      disabled={isInputDisabled}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isRecording ? (
                        <MicOff className="h-5 w-5 text-red-500" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                      <span className="sr-only">
                        {isRecording ? 'Stop recording' : 'Start voice recording'}
                      </span>
                    </Button>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isRecording ? 'Stop recording' : 'Start voice recording'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Send Button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Button 
                      type="submit"
                      variant="ghost"
                      size="icon"
                      disabled={!canSendMessage}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <AnimatePresence mode="wait">
                        {isGenerating ? (
                          <motion.div
                            key="loading"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="send"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Send className="h-5 w-5" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <span className="sr-only">Send message</span>
                    </Button>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Send message</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default MessageInput;
