/**
 * bot message component that displays ai responses with animations and actions 🤖
 * 
 * features:
 * - streaming text animation with cursor blink
 * - copy to clipboard
 * - regenerate response
 * - pulse animation during streaming
 * - hover actions menu
 * - success toast notifications
 * 
 * @param message - the message object containing content and metadata
 * @param isLastMessage - whether this is the most recent message
 */

import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { Message, MessageMetadata, SearchResult } from '@/lib/types/chat';
import { motion } from 'framer-motion';
import { Copy, RotateCcw, Check, Search as SearchIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { chatService } from '@/lib/services/chat.service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Format timestamp to HH:MM format (24-hour)
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

interface BotMessageProps {
  message: Message;
  isLastMessage: boolean;
}

const BotMessage: React.FC<BotMessageProps> = ({
  message,
  isLastMessage
}) => {
  const dispatch = useAppDispatch();
  const [copySuccess, setCopySuccess] = useState(false);
  const isGenerating = useAppSelector((state) => state.chat.isGenerating);
  const { sessions, currentSessionId } = useAppSelector((state) => state.chat);
  const currentModel = useAppSelector((state) => state.chat.currentModel);
  const isGPT4Mini = currentModel === 'gpt-4o-mini';
  const editingMessageId = useAppSelector((state) => state.chat.editingMessageId);
  
  // Show streaming indicator for last message
  const showStreamingIndicator = message.is_streaming && isLastMessage;

  // Handle metadata from agent responses
  const metadata = message.metadata as MessageMetadata;
  const hasAgentResults = metadata && (metadata.search?.length || metadata.steps?.length);

  // Remove timestamp prefix if present in content
  let displayContent = message.content;
  if (displayContent.match(/^\[\d{2}:\d{2}(:\d{2})?\]/)) {
    displayContent = displayContent.replace(/^\[\d{2}:\d{2}(:\d{2})?\]\s*/, '');
  }

  // Subtle pulse animation while message is streaming
  const pulseAnimation = message.is_streaming ? {
    boxShadow: [
      '0 0 0 0 rgba(59, 130, 246, 0)',
      '0 0 0 3px rgba(59, 130, 246, 0.2)',
      '0 0 0 0 rgba(59, 130, 246, 0)'
    ]
  } : {};

  // Copy message content to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopySuccess(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopySuccess(false), 2000);
      });
  };
  
  // Regenerate the last message response in-place
  const handleRegenerate = async () => {
    if (isGenerating) {
      toast.error("Cannot regenerate while already generating");
      return;
    }
    
    console.log("=== starting regeneration ===");
    
    // Find the current session
    const currentSession = sessions.find(session => session.id === currentSessionId);
    if (!currentSession) {
      toast.error("Cannot find current session");
      return;
    }
    
    // Get all messages in the session
    const allMessages = currentSession.messages;
    
    // Find this message's index in the session
    const currentMessageIndex = allMessages.findIndex(m => m.id === message.id);
    if (currentMessageIndex === -1) {
      toast.error("Cannot find current message in session");
      return;
    }
    
    // Find the last user message before this message
    let lastUserMessage = null;
    
    for (let i = currentMessageIndex - 1; i >= 0; i--) {
      if (allMessages[i].role === 'user') {
        lastUserMessage = allMessages[i];
        break;
      }
    }
    
    if (!lastUserMessage) {
      toast.error("No user message found to regenerate from");
      return;
    }
    
    try {
      await chatService.regenerateMessage(message.id);
      toast.success("Regenerating response...");
    } catch (error) {
      toast.error("Failed to regenerate response");
      console.error("Failed to start regeneration:", error);
    }
  };

  return (
    <div className="flex items-start gap-3 max-w-4xl">
      <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
        <span>AI</span>
      </Avatar>
      
      <div className="flex-1 relative">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(message.timestamp)}
          </span>
          {isGPT4Mini && metadata?.useSearch && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <SearchIcon size={12} />
              Web Search Enabled
            </span>
          )}
        </div>
        
        <motion.div 
          layout 
          className="mt-1" 
          initial={{ opacity: 0 }} 
          animate={{
            opacity: 1,
            ...pulseAnimation
          }} 
          transition={{ 
            duration: message.is_streaming ? 0.2 : 0,
            ease: [0.2, 0, 0.2, 1]
          }}
        >
          <div className="p-3 rounded-lg relative group bg-transparent">
            <div className="whitespace-pre-wrap">
              {displayContent}
              {showStreamingIndicator && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse-slow" />
              )}
            </div>

            {/* Show agent results if present */}
            {hasAgentResults && (
              <div className="mt-2 text-sm text-muted-foreground">
                {metadata.search && metadata.search.length > 0 && (
                  <div className="mt-1">
                    <strong>Search Results:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {metadata.search.map((result: SearchResult, index: number) => (
                        <li key={index} className="truncate">
                          {result.title || result.content}
                          {result.url && (
                            <a 
                              href={result.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="ml-1 text-primary hover:underline"
                            >
                              (source)
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {metadata.steps && metadata.steps.length > 0 && (
                  <div className="mt-1">
                    <strong>Steps:</strong>
                    <ul className="list-decimal list-inside mt-1">
                      {metadata.steps.map((step: string, index: number) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            
            {/* Action buttons */}
            <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                    >
                      {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy to clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {isLastMessage && !message.is_streaming && !isGenerating && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRegenerate}
                        className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                      >
                        <RotateCcw size={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Regenerate response</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default BotMessage;