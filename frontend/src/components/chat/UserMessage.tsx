/**
 * user message component - shows user messages with editing options
 * 
 * features:
 * - edit messages with live preview
 * - copy to clipboard functionality
 * - regenerate responses
 * - branch navigation for viewing edit history
 * - delete message option
 * - responsive hover controls
 */
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
      // position cursor at the end of the text
      const length = textFieldRef.current.value.length;
      textFieldRef.current.setSelectionRange(length, length)
    }
  }, [isEditing]);
  
  // calculate the branch number based on the rules:
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
    
    console.log("=== user message regenerate requested ===");
    console.log("user message id:", message.id);
    
    // get current state to find the next bot message
    const state = store.getState();
    const sessionId = state.chat.currentSessionId;
    
    if (!sessionId) {
      console.error("no current session found");
      return;
    }
    
    // find the current session
    const session = state.chat.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.error("session not found");
      return;
    }
    
    // get all messages in the session
    const allMessages = session.messages;
    console.log("all messages in session:", allMessages.map(m => ({ id: m.id, role: m.role })));
    
    // find this message's index in the session
    const currentMessageIndex = allMessages.findIndex(m => m.id === message.id);
    if (currentMessageIndex === -1) {
      console.error("cannot find current message in session, id:", message.id);
      return;
    }
    
    console.log(`found user message at index ${currentMessageIndex} of ${allMessages.length}`);
    
    // check if there's a bot message after this user message
    if (currentMessageIndex < allMessages.length - 1) {
      const nextMessage = allMessages[currentMessageIndex + 1];
      
      // if the next message is from the bot, remove it instead of replacing it
      if (nextMessage.role === 'assistant') {
        console.log("found bot message to remove:", nextMessage.id);
        
        // dispatch action to remove the message
        store.dispatch(removeMessage(nextMessage.id));
        
        console.log("removed bot message, now generating new response");
      }
    }
    
    // generate a new response (without replacement)
    console.log("generating new bot response");
    webSocketManager.regenerateResponse(message.content, currentModelId || 'gpt-4');
  };

  // handler for saving a message after editing
  const handleSave = () => {
    console.log("=== saving edited message ===");
    console.log("message id:", message.id);
    
    // check if content actually changed
    const hasChanged = editedContent.trim() !== message.content;
    
    if (hasChanged) {
      // update the message in the store
      dispatch(updateMessage({
        id: message.id,
        content: editedContent.trim()
      }));
      
      setContentChanged(true);
      
      // find all messages after this user message and archive them (branch handling)
      const state = store.getState();
      const sessionId = state.chat.currentSessionId;
      
      if (sessionId) {
        const session = state.chat.sessions.find(s => s.id === sessionId);
        if (session) {
          const msgIndex = session.messages.findIndex(m => m.id === message.id);
          console.log(`found user message at index ${msgIndex} of ${session.messages.length}`);
          
          // check if there are any messages after this one
          if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
            // get all messages after the edited message
            const messagesAfter = session.messages.slice(msgIndex + 1);
            console.log(`found ${messagesAfter.length} messages after the edited message, archiving them`);
            
            // remove all messages after the edited one (they will be archived in a branch)
            for (const msgToRemove of messagesAfter) {
              // todo: in a real implementation, these messages would be stored in a branch
              store.dispatch(removeMessage(msgToRemove.id));
            }
            
            // wait for state updates to complete
            setTimeout(() => {
              // generate a new response to the edited message, starting a new branch
              webSocketManager.regenerateResponse(
                editedContent.trim(), 
                currentModelId || 'gpt-4'
              );
            }, 100);
          } else {
            // if this is the last message, just generate a new response
            setTimeout(() => {
              webSocketManager.regenerateResponse(editedContent.trim(), currentModelId || 'gpt-4');
            }, 100);
          }
        }
      }
    }
    
    // exit editing mode even if content didn't change
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };

  // cancels edit mode and reverts content
  const handleCancel = () => {
    console.log("cancelling edit mode");
    setEditedContent(message.content);
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };
  
  // handler to delete this message
  const handleDelete = () => {
    console.log("=== deleting message ===");
    console.log("message id:", message.id);
    
    // find messages after this one to handle branching
    const state = store.getState();
    const sessionId = state.chat.currentSessionId;
    
    if (sessionId) {
      const session = state.chat.sessions.find(s => s.id === sessionId);
      if (session) {
        const msgIndex = session.messages.findIndex(m => m.id === message.id);
        
        // if there's a bot message right after this user message, remove it too
        if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
          const nextMessage = session.messages[msgIndex + 1];
          if (nextMessage.role === 'assistant') {
            store.dispatch(removeMessage(nextMessage.id));
          }
        }
        
        // remove this message
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
    console.log("key pressed:", e.key);
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault(); // prevent default behavior
      console.log("escape key pressed, cancelling edit");
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
                
                {/* action buttons shown on hover */}
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {/* copy button */}
                  <Tooltip title="Copy to clipboard">
                    <IconButton size="small" onClick={handleCopy} className="text-muted-foreground">
                      <Copy size={16} />
                    </IconButton>
                  </Tooltip>
                  
                  {/* edit button - only show if not currently generating */}
                  {!isGenerating && (
                    <Tooltip title="Edit message">
                      <IconButton size="small" onClick={handleEdit} className="text-muted-foreground">
                        <Edit2 size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  {/* delete button */}
                  <Tooltip title="Delete message">
                    <IconButton size="small" onClick={handleDelete} className="text-muted-foreground">
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                  
                  {/* regenerate button - only show if this is the last user message */}
                  {isLastUserMessage && !isGenerating && (
                    <Tooltip title="Regenerate response">
                      <IconButton size="small" onClick={handleRegenerate} className="text-muted-foreground">
                        <RefreshCw size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  
                  {/* disabled regenerate button when generating */}
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
              
              {/* branch navigation controls - moved below the message */}
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
      
      {/* copy success notification */}
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