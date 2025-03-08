
import React from 'react';
import { useDispatch } from 'react-redux';
import { Message } from '@/types';
import { motion } from 'framer-motion';
import { Copy, RotateCcw } from 'lucide-react';
import { Paper, IconButton, Avatar, Tooltip } from '@mui/material';

interface BotMessageProps {
  message: Message;
  isLastMessage: boolean;
}

const BotMessage: React.FC<BotMessageProps> = ({ message, isLastMessage }) => {
  const dispatch = useDispatch();

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    // Show toast notification
    console.log('Copied to clipboard');
  };

  const handleRegenerate = () => {
    // Implement regeneration logic
    console.log('Regenerate response');
  };

  // Define pulse animation for streaming messages
  const pulseAnimation = message.is_streaming
    ? { opacity: [1, 0.7, 1], transition: { repeat: Infinity, duration: 1.5 } }
    : {};

  return (
    <div className="flex items-start gap-3 max-w-4xl">
      <Avatar 
        sx={{ width: 36, height: 36 }}
        className="bg-accent text-accent-foreground"
      >
        AI
      </Avatar>
      
      <div className="flex-1">
        <span className="text-sm font-medium">Assistant</span>
        
        <motion.div
          layout
          className="mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, ...pulseAnimation }}
          transition={{ duration: 0.2 }}
        >
          <Paper 
            className="p-3 rounded-lg relative group" 
            elevation={0}
          >
            <div className="whitespace-pre-wrap">
              {message.content}
              {message.is_streaming && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse-slow" />
              )}
            </div>
            
            <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <Tooltip title="Copy to clipboard">
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  className="text-muted-foreground"
                >
                  <Copy size={16} />
                </IconButton>
              </Tooltip>
              
              {isLastMessage && !message.is_streaming && (
                <Tooltip title="Regenerate response">
                  <IconButton
                    size="small"
                    onClick={handleRegenerate}
                    className="text-muted-foreground"
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </Paper>
        </motion.div>
      </div>
    </div>
  );
};

export default BotMessage;
