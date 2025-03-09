import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { toggleToolsMenu } from '@/redux/features/uiSlice';
import { addMessage, setIsGenerating } from '@/redux/features/chatSlice';
import ToolsMenu from '../ui/ToolsMenu';
import webSocketManager from '@/utils/webSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, PlusCircle, StopCircle, Loader2 } from 'lucide-react';
import { TextField, IconButton, Tooltip, Paper } from '@mui/material';

const MessageInput: React.FC = () => {
  const dispatch = useDispatch();
  const [message, setMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { isGenerating, currentModelId } = useSelector((state: RootState) => state.chat);
  const { isToolsMenuOpen } = useSelector((state: RootState) => state.ui);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!message.trim() || isGenerating) return;
    
    if (!webSocketManager) return;
    
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

  return (
    <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/50 p-4">
      <div className="max-w-4xl mx-auto relative">
        <Paper 
          elevation={0} 
          component="form" 
          onSubmit={handleSubmit} 
          className="flex items-end gap-2 p-2 rounded-lg border"
        >
          <Tooltip title="Tools & agents">
            <IconButton 
              onClick={() => dispatch(toggleToolsMenu())}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <PlusCircle size={22} />
            </IconButton>
          </Tooltip>
          
          <TextField
            inputRef={textareaRef}
            multiline
            maxRows={5}
            placeholder="Message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            fullWidth
            variant="standard"
            InputProps={{
              disableUnderline: true,
              style: { fontSize: '0.95rem' }
            }}
          />
          
          <div className="flex items-center">
            <AnimatePresence mode="wait">
              {!isGenerating ? (
                <>
                  <motion.div
                    key="mic-button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Tooltip title={isListening ? "Stop listening" : "Voice input"}>
                      <IconButton 
                        onClick={handleMicToggle}
                        color={isListening ? "primary" : "default"}
                        className={`${isListening ? 'text-primary' : 'text-muted-foreground hover:text-foreground'} transition-colors`}
                      >
                        <Mic size={22} />
                      </IconButton>
                    </Tooltip>
                  </motion.div>
                
                  <motion.div
                    key="send-button"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Tooltip title="Send message">
                      <span>
                        <IconButton 
                          onClick={() => handleSubmit()}
                          disabled={!message.trim()}
                          color="primary"
                          className={`${!message.trim() ? 'opacity-50' : ''}`}
                        >
                          <Send size={22} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </motion.div>
                </>
              ) : (
                <motion.div
                  key="stop-button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Tooltip title="Stop generating">
                    <IconButton 
                      onClick={handleStopGeneration}
                      className="text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <StopCircle size={22} />
                    </IconButton>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Paper>
        
        {isToolsMenuOpen && (
          <ToolsMenu />
        )}
        
        <div className="flex justify-center mt-2 space-x-2">
          <span className="text-xs text-muted-foreground">
            File upload
          </span>
          <span className="text-xs text-muted-foreground">
            Web search
          </span>
          <span className="text-xs text-muted-foreground">
            Code interpreter
          </span>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
