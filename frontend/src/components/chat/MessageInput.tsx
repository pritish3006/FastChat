/**
 * message input component w/ tools menu + voice input 🚀
 * 
 * features:
 * - expandable text input
 * - tools menu
 * - voice input
 * - stop gen button
 * - websocket msgs
 */

import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { toggleToolsMenu } from '@/redux/features/uiSlice';
import { addMessage, setIsGenerating } from '@/redux/features/chatSlice';
import ToolsMenu from '../ui/ToolsMenu';
import webSocketManager from '@/utils/webSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, PlusCircle, StopCircle, Upload, Search, Code } from 'lucide-react';
import { TextField, IconButton, Tooltip, Paper, Button } from '@mui/material';

const MessageInput: React.FC = () => {
  const dispatch = useDispatch();
  const { isGenerating, currentModelId, editingMessageId } = useSelector((state: RootState) => state.chat);
  const { isToolsMenuOpen } = useSelector((state: RootState) => state.ui);

  const [message, setMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // disable input when editing or generating
  const isInputDisabled = !!editingMessageId || isGenerating;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!message.trim() || isGenerating) return;
    
    webSocketManager.sendMessage(message.trim(), currentModelId || 'gpt-4');
    
    setMessage('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleStopGeneration = () => {
    webSocketManager.stopGeneration();
  };

  const handleMicToggle = () => {
    if (!isListening) {
      setIsListening(true);
      
      setTimeout(() => {
        setMessage(prev => prev + " Voice input would go here");
        setIsListening(false);
      }, 2000);
    } else {
      setIsListening(false);
    }
  };

  const handleToolsToggle = () => {
    dispatch(toggleToolsMenu());
  };

  return (
    <div className="p-4 border-t relative">
      <AnimatePresence>
        {isToolsMenuOpen && (
          <ToolsMenu />
        )}
      </AnimatePresence>
      
      <div className="max-w-4xl mx-auto space-y-4">
        <Paper
          component="form"
          onSubmit={handleSubmit}
          elevation={0}
          className="flex items-center p-2 rounded-lg border relative"
        >
          <Tooltip title="Tools" arrow placement="top">
            <IconButton 
              onClick={handleToolsToggle}
              size="small"
              className={`mr-1 ${isToolsMenuOpen ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <PlusCircle size={20} />
            </IconButton>
          </Tooltip>
          
          <TextField
            fullWidth
            multiline
            maxRows={5}
            placeholder={isInputDisabled ? "Wait for response..." : "Type a message..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
            }}
            inputRef={textareaRef}
            disabled={isInputDisabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          
          <div className="flex items-center">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Tooltip title="Stop generating" arrow placement="top">
                    <IconButton
                      onClick={handleStopGeneration}
                      className="text-destructive"
                      disabled={!isGenerating}
                    >
                      <StopCircle size={20} />
                    </IconButton>
                  </Tooltip>
                </motion.div>
              ) : (
                <motion.div
                  key="send"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Tooltip title="Send message" arrow placement="top">
                    <span>
                      <IconButton
                        color="primary"
                        onClick={() => handleSubmit()}
                        disabled={!message.trim() || isGenerating}
                      >
                        <Send size={20} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Paper>
      </div>
    </div>
  );
};

export default MessageInput;
