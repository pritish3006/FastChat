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
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { setIsGenerating } from '@/redux/features/chatSlice';
import { Message } from '@/types';
import { motion } from 'framer-motion';
import { Copy, RotateCcw, Check } from 'lucide-react';
import { IconButton, Avatar, Tooltip, Snackbar } from '@mui/material';
import webSocketManager from '@/utils/webSocket';

// format timestamp to HH:MM format (24-hour)
const formatTimestamp = (timestamp: number): string => {
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
  const dispatch = useDispatch();
  const [copySuccess, setCopySuccess] = useState(false);
  const isGenerating = useSelector((state: RootState) => state.chat.isGenerating);
  const { sessions, currentSessionId } = useSelector((state: RootState) => state.chat);
  const editingMessageId = useSelector((state: RootState) => state.chat.editingMessageId);
  
  // Only show cursor when the message is actively streaming
  const showCursorBlink = isLastMessage && message.is_streaming;

  // Remove timestamp prefix if present in content
  let displayContent = message.content;
  // Check for timestamp pattern [hh:mm:ss] at the beginning and remove it
  if (displayContent.match(/^\[\d{2}:\d{2}(:\d{2})?\]/)) {
    displayContent = displayContent.replace(/^\[\d{2}:\d{2}(:\d{2})?\]\s*/, '');
  }

  // subtle pulse animation while message is streaming
  const pulseAnimation = message.is_streaming ? {
    boxShadow: [
      '0 0 0 0 rgba(59, 130, 246, 0)',
      '0 0 0 3px rgba(59, 130, 246, 0.2)',
      '0 0 0 0 rgba(59, 130, 246, 0)'
    ]
  } : {};

  // copy message content to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
  };
  
  // regenerate the last message response in-place
  const handleRegenerate = () => {
    if (isGenerating) {
      console.log("Cannot regenerate while already generating");
      return;
    }
    
    console.log("=== STARTING REGENERATION ===");
    console.log("Message to regenerate:", message);
    
    // Find the latest user message to regenerate from
    const currentSession = sessions.find(session => session.id === currentSessionId);
    if (!currentSession) {
      console.error("Cannot find current session");
      return;
    }
    
    // Get all messages in the session
    const allMessages = currentSession.messages;
    console.log("All messages in session:", allMessages.map(m => ({ id: m.id, role: m.role })));
    
    // Find this message's index in the session
    const currentMessageIndex = allMessages.findIndex(m => m.id === message.id);
    if (currentMessageIndex === -1) {
      console.error("Cannot find current message in session, ID:", message.id);
      return;
    }
    
    console.log(`Found bot message at index ${currentMessageIndex} of ${allMessages.length}`);
    
    // Find the last user message before this message
    let lastUserMessage = '';
    let lastUserMessageId = '';
    
    for (let i = currentMessageIndex - 1; i >= 0; i--) {
      if (allMessages[i].role === 'user') {
        lastUserMessage = allMessages[i].content;
        lastUserMessageId = allMessages[i].id;
        console.log(`Found user message at index ${i}: ${lastUserMessageId}`);
        break;
      }
    }
    
    if (!lastUserMessage) {
      console.error("No user message found before this bot message");
      return;
    }
    
    console.log(`Will regenerate bot message ${message.id} in response to user message: "${lastUserMessage.substring(0, 30)}..."`);
    
    try {
      // Pass the current message ID to replace in-place
      webSocketManager.regenerateResponse(
        lastUserMessage,
        currentSession.model_id,
        message.id
      );
      console.log("Regeneration request sent successfully");
    } catch (error) {
      console.error("Failed to start regeneration:", error);
    }
  };

  return <div className="flex items-start gap-3 max-w-4xl">
      <Avatar sx={{
      width: 36,
      height: 36
    }} className="bg-primary text-primary-foreground">
        AI
      </Avatar>
      
      <div className="flex-1 relative">
        <div className="flex items-center justify-between">
           <span className="text-xs text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
        </div>
        
        <motion.div layout className="mt-1" initial={{
        opacity: 0
      }} animate={{
        opacity: 1,
        ...pulseAnimation
      }} transition={{
        duration: 0.2
      }}>
          <div className="p-3 rounded-lg relative group bg-transparent">
            <div className="whitespace-pre-wrap">
              {displayContent}
              {showCursorBlink && 
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse-slow" />
              }
            </div>
            
            <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <Tooltip title="Copy to clipboard">
                <IconButton size="small" onClick={handleCopy} className="text-muted-foreground">
                  <Copy size={16} />
                </IconButton>
              </Tooltip>
              
              {isLastMessage && !message.is_streaming && !isGenerating && (
                <Tooltip title="Regenerate response">
                  <IconButton size="small" onClick={handleRegenerate} className="text-muted-foreground">
                    <RotateCcw size={16} />
                  </IconButton>
                </Tooltip>
              )}
              
              {/* Disabled regenerate button when generating */}
              {isLastMessage && !message.is_streaming && isGenerating && (
                <Tooltip title="Cannot regenerate while generating">
                  {/* Wrap disabled button in span to fix MUI tooltip issue */}
                  <span>
                    <IconButton 
                      size="small" 
                      disabled={true}
                      className="text-muted-foreground opacity-50"
                    >
                      <RotateCcw size={16} />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        </motion.div>
      </div>
      
      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>;
};

export default BotMessage;