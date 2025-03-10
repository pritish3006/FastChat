// user message component that displays user messages in the chat interface
// handles message editing functionality with optimistic updates
import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateMessage, setEditingMessageId, removeMessage, navigateToPreviousBranch, navigateToNextBranch } from '@/redux/features/chatSlice';
import { Message } from '@/types';
import { motion } from 'framer-motion';
import { Edit2, Check, X, RefreshCw, Trash2, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { Paper, IconButton, TextField, Avatar, Box, Tooltip, Snackbar } from '@mui/material';
import { store, RootState } from '@/redux/store';
import webSocketManager from '@/utils/webSocket';

// props interface for user message component
interface UserMessageProps {
  message: Message; // message object containing content and metadata
  isLastUserMessage?: boolean; // flag to indicate if this is the last user message
  isBranchPoint?: boolean; // flag to indicate if this message has branches
  hasBranches?: boolean; // flag to indicate if branches exist for this message
  branchIndex?: number; // current branch index for navigation
  totalBranches?: number; // total number of branches for this message
}

// format timestamp to HH:MM format (24-hour)
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

// user message component displays individual user messages with editing capabilities
const UserMessage: React.FC<UserMessageProps> = ({
  message,
  isLastUserMessage = false,
  isBranchPoint = false,
  hasBranches = false,
  branchIndex = 0,
  totalBranches = 0
}) => {
  // initialize redux dispatch
  const dispatch = useDispatch();

  // get the current editing message id and generating state from the redux store
  const editingMessageId = useSelector((state: RootState) => state.chat.editingMessageId);
  const { isGenerating, currentModelId } = useSelector((state: RootState) => state.chat);

  // local state for editing mode and content
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [contentChanged, setContentChanged] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // ref for focusing the text field
  const textFieldRef = useRef<HTMLTextAreaElement>(null);

  // effect to focus text field when editing starts
  useEffect(() => {
    if (isEditing && textFieldRef.current) {
      textFieldRef.current.focus();
      // Position cursor at the end of the text
      const length = textFieldRef.current.value.length;
      textFieldRef.current.setSelectionRange(length, length)
    }
  }, [isEditing]);
  
  // Calculate the branch number based on the rules:
  // - current branch = n (total branches)
  // - most recent previous branch = n - 1
  // - oldest branch = 1
  const displayedBranchIndex = branchIndex === 0 ? totalBranches : totalBranches - branchIndex + 1;
  
  // handler to copy message to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
  };

  // handlers for message editing actions
  const handleEdit = () => {
    setIsEditing(true);
    setContentChanged(false);
    // set the global editing state
    dispatch(setEditingMessageId(message.id));
  };

  // handler to regenerate response based on this message
  const handleRegenerate = () => {
    if (isGenerating) return;
    
    console.log("=== USER MESSAGE REGENERATE REQUESTED ===");
    console.log("User message ID:", message.id);
    
    // Get current state to find the next bot message
    const state = store.getState();
    const sessionId = state.chat.currentSessionId;
    
    if (!sessionId) {
      console.error("No current session found");
      return;
    }
    
    // Find the current session
    const session = state.chat.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.error("Session not found");
      return;
    }
    
    // Get all messages in the session
    const allMessages = session.messages;
    console.log("All messages in session:", allMessages.map(m => ({ id: m.id, role: m.role })));
    
    // Find this message's index in the session
    const currentMessageIndex = allMessages.findIndex(m => m.id === message.id);
    if (currentMessageIndex === -1) {
      console.error("Cannot find current message in session, ID:", message.id);
      return;
    }
    
    console.log(`Found user message at index ${currentMessageIndex} of ${allMessages.length}`);
    
    // Check if there's a bot message after this user message
    if (currentMessageIndex < allMessages.length - 1) {
      const nextMessage = allMessages[currentMessageIndex + 1];
      
      // If the next message is from the bot, remove it instead of replacing it
      if (nextMessage.role === 'assistant') {
        console.log("Found bot message to remove:", nextMessage.id);
        
        // Dispatch action to remove the message
        store.dispatch(removeMessage(nextMessage.id));
        
        console.log("Removed bot message, now generating new response");
      }
    }
    
    // Generate a new response (without replacement)
    console.log("Generating new bot response");
    webSocketManager.regenerateResponse(message.content, currentModelId || 'gpt-4');
  };

  // handler for saving a message after editing
  const handleSave = () => {
    console.log("=== SAVING EDITED MESSAGE ===");
    console.log("Message ID:", message.id);
    
    // Check if content actually changed
    const hasChanged = editedContent.trim() !== message.content;
    
    if (hasChanged) {
      // Update the message in the store
      dispatch(updateMessage({
        id: message.id,
        content: editedContent.trim()
      }));
      
      setContentChanged(true);
      
      // Find all messages after this user message and archive them (branch handling)
      const state = store.getState();
      const sessionId = state.chat.currentSessionId;
      
      if (sessionId) {
        const session = state.chat.sessions.find(s => s.id === sessionId);
        if (session) {
          const msgIndex = session.messages.findIndex(m => m.id === message.id);
          console.log(`Found user message at index ${msgIndex} of ${session.messages.length}`);
          
          // Check if there are any messages after this one
          if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
            // Get all messages after the edited message
            const messagesAfter = session.messages.slice(msgIndex + 1);
            console.log(`Found ${messagesAfter.length} messages after the edited message, archiving them`);
            
            // Remove all messages after the edited one (they will be archived in a branch)
            for (const msgToRemove of messagesAfter) {
              // TODO: In a real implementation, these messages would be stored in a branch
              store.dispatch(removeMessage(msgToRemove.id));
            }
            
            // Wait for state updates to complete
            setTimeout(() => {
              // Generate a new response to the edited message, starting a new branch
              webSocketManager.regenerateResponse(
                editedContent.trim(), 
                currentModelId || 'gpt-4'
              );
            }, 100);
          } else {
            // If this is the last message, just generate a new response
            setTimeout(() => {
              webSocketManager.regenerateResponse(editedContent.trim(), currentModelId || 'gpt-4');
            }, 100);
          }
        }
      }
    }
    
    // Exit editing mode even if content didn't change
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };

  // cancels edit mode and reverts content
  const handleCancel = () => {
    console.log("Cancelling edit mode");
    setEditedContent(message.content);
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };
  
  // handler to delete this message
  const handleDelete = () => {
    console.log("=== DELETING MESSAGE ===");
    console.log("Message ID:", message.id);
    
    // Find messages after this one to handle branching
    const state = store.getState();
    const sessionId = state.chat.currentSessionId;
    
    if (sessionId) {
      const session = state.chat.sessions.find(s => s.id === sessionId);
      if (session) {
        const msgIndex = session.messages.findIndex(m => m.id === message.id);
        
        // If there's a bot message right after this user message, remove it too
        if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
          const nextMessage = session.messages[msgIndex + 1];
          if (nextMessage.role === 'assistant') {
            store.dispatch(removeMessage(nextMessage.id));
          }
        }
        
        // Remove this message
        store.dispatch(removeMessage(message.id));
      }
    }
  };
  
  // handlers for branch navigation
  const handlePreviousBranch = () => {
    dispatch(navigateToPreviousBranch());
  };
  
  const handleNextBranch = () => {
    dispatch(navigateToNextBranch());
  };

  // handler for keyboard events to support shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    console.log("Key pressed:", e.key);
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault(); // Prevent default behavior
      console.log("Escape key pressed, cancelling edit");
      handleCancel();
    }
  };

  // handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedContent(e.target.value);
  };

  return <div className="flex items-start gap-3 max-w-4xl">
      {/* user avatar */}
      <Avatar sx={{
      width: 36,
      height: 36
    }} className="bg-primary text-primary-foreground">
        U
      </Avatar>
      
      <div className="flex-1 relative">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{formatTimestamp(message.timestamp)}</span>
        </div>
        
        {/* animated container for message content */}
        <motion.div layout className="mt-1" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        duration: 0.2
      }}>
          {/* conditional render based on edit mode */}
          {isEditing ? (
            // edit mode view with text field and action buttons
            <Paper className="p-3 rounded-lg" elevation={0}>
              <TextField 
                multiline 
                fullWidth 
                value={editedContent} 
                onChange={handleContentChange} 
                variant="standard" 
                inputProps={{
                  style: { padding: '0px' }
                }}
                sx={{ 
                  '& .MuiInput-underline:before': { borderBottom: 'none' },
                  '& .MuiInput-underline:after': { borderBottom: 'none' },
                  '& .MuiInput-underline:hover:not(.Mui-disabled):before': { borderBottom: 'none' },
                }}
                inputRef={textFieldRef}
                onKeyDown={handleKeyDown}
              />
              
              {/* edit mode action buttons */}
              <div className="flex justify-end gap-2 mt-2">
                <IconButton size="small" onClick={handleCancel} className="text-muted-foreground">
                  <X size={16} />
                </IconButton>
                
                <IconButton size="small" onClick={handleSave} color="primary">
                  <Check size={16} />
                </IconButton>
              </div>
            </Paper>
          ) : (
            // view mode with hoverable actions
            <div>
              <Paper 
                className={`p-3 rounded-lg relative group ${isBranchPoint ? 'border-l-2 border-primary' : ''}`} 
                elevation={0}
              >
                <div className="whitespace-pre-wrap">
                  {message.content}
                </div>
                
                {/* Action buttons shown on hover */}
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {/* Copy button */}
                  <Tooltip title="Copy to clipboard">
                    <IconButton size="small" onClick={handleCopy} className="text-muted-foreground">
                      <Copy size={16} />
                    </IconButton>
                  </Tooltip>
                  
                  {/* Edit button - only show if not currently generating */}
                  {!isGenerating && (
                    <Tooltip title="Edit message">
                      <IconButton size="small" onClick={handleEdit} className="text-muted-foreground">
                        <Edit2 size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  {/* Delete button */}
                  <Tooltip title="Delete message">
                    <IconButton size="small" onClick={handleDelete} className="text-muted-foreground">
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                  
                  {/* Regenerate button - only show if this is the last user message */}
                  {isLastUserMessage && !isGenerating && (
                    <Tooltip title="Regenerate response">
                      <IconButton size="small" onClick={handleRegenerate} className="text-muted-foreground">
                        <RefreshCw size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  {/* Disabled regenerate button when generating */}
                  {isLastUserMessage && isGenerating && (
                    <Tooltip title="Cannot regenerate while generating">
                      <span>
                        <IconButton 
                          size="small" 
                          disabled
                          className="text-muted-foreground opacity-50"
                        >
                          <RefreshCw size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </div>
              </Paper>
              
              {/* Branch navigation controls - moved below the message */}
              {hasBranches && (
                <div className="flex items-center justify-end gap-1 mt-1 text-xs text-muted-foreground">
                  <IconButton 
                    size="small" 
                    onClick={handlePreviousBranch}
                    className="p-0.5 text-muted-foreground"
                  >
                    <ChevronLeft size={14} />
                  </IconButton>
                  
                  <span>
                    {displayedBranchIndex}/{totalBranches}
                    {branchIndex === 0 && <span className="ml-1 font-medium">(current)</span>}
                  </span>
                  
                  <IconButton 
                    size="small" 
                    onClick={handleNextBranch}
                    className="p-0.5 text-muted-foreground"
                  >
                    <ChevronRight size={14} />
                  </IconButton>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
      
      {/* Copy success notification */}
      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>;
};

export default UserMessage;