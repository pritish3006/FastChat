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
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { updateMessage, setEditingMessageId, removeMessage, navigateToPreviousBranch, navigateToNextBranch } from '@/lib/store/slices/chatSlice';
import { Message } from '@/lib/types/chat';
import { motion } from 'framer-motion';
import { Edit2, Check, X, RefreshCw, Trash2, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { chatService } from '@/lib/services/chat.service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
const formatTimestamp = (timestamp: string): string => {
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
  const dispatch = useAppDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [copySuccess, setCopySuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get state from Redux store
  const { isGenerating, currentModelId, sessions, currentSessionId } = useAppSelector(state => state.chat);
  const editingMessageId = useAppSelector(state => state.chat.editingMessageId);

  // Calculate displayed branch index
  const displayedBranchIndex = branchIndex === 0 ? totalBranches : totalBranches - branchIndex + 1;

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const length = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  // Copy message to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
      .then(() => {
        setCopySuccess(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopySuccess(false), 2000);
      });
  };

  // Start editing mode
  const handleEdit = () => {
    setIsEditing(true);
    dispatch(setEditingMessageId(message.id));
  };

  // Regenerate response based on this message
  const handleRegenerate = async () => {
    if (isGenerating) {
      toast.error("Cannot regenerate while already generating");
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

  // Save edited message
  const handleSave = async () => {
    const hasChanged = editedContent.trim() !== message.content;
    
    if (hasChanged) {
      try {
        await dispatch(updateMessage({
          id: message.id,
          content: editedContent.trim()
        })).unwrap();

        // Find messages after this one to handle branching
        const session = sessions.find(s => s.id === currentSessionId);
        if (session) {
          const msgIndex = session.messages.findIndex(m => m.id === message.id);
          
          if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
            // Remove all messages after the edited one
            const messagesAfter = session.messages.slice(msgIndex + 1);
            for (const msgToRemove of messagesAfter) {
              await dispatch(removeMessage(msgToRemove.id)).unwrap();
            }
            
            // Generate new response
            await chatService.regenerateMessage(message.id);
          } else {
            // If this is the last message, just generate a new response
            await chatService.regenerateMessage(message.id);
          }
        }
      } catch (error) {
        toast.error("Failed to update message");
        console.error("Failed to save message:", error);
      }
    }
    
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };

  // Cancel editing
  const handleCancel = () => {
    setEditedContent(message.content);
    setIsEditing(false);
    dispatch(setEditingMessageId(null));
  };

  // Delete message
  const handleDelete = async () => {
    try {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        const msgIndex = session.messages.findIndex(m => m.id === message.id);
        
        // If there's a bot message right after this user message, remove it too
        if (msgIndex >= 0 && msgIndex < session.messages.length - 1) {
          const nextMessage = session.messages[msgIndex + 1];
          if (nextMessage.role === 'assistant') {
            await dispatch(removeMessage(nextMessage.id)).unwrap();
          }
        }
        
        await dispatch(removeMessage(message.id)).unwrap();
      }
    } catch (error) {
      toast.error("Failed to delete message");
      console.error("Failed to delete message:", error);
    }
  };

  // Branch navigation handlers
  const handlePreviousBranch = () => {
    dispatch(navigateToPreviousBranch());
  };

  const handleNextBranch = () => {
    dispatch(navigateToNextBranch());
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return <div className="flex items-start gap-3 max-w-4xl">
      {/* user avatar */}
      <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
        <span>U</span>
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
            <div className="p-3 rounded-lg bg-muted">
              <Textarea 
                ref={textareaRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] resize-none border-none bg-transparent focus-visible:ring-0"
              />
              
              {/* edit mode action buttons */}
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancel}
                  className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                >
                  <X size={16} />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  className="h-8 w-8 text-primary hover:bg-primary/10"
                >
                  <Check size={16} />
                </Button>
              </div>
            </div>
          ) : (
            // view mode with hoverable actions
            <div>
              <div className={`p-3 rounded-lg relative group ${isBranchPoint ? 'border-l-2 border-primary' : ''}`}>
                <div className="whitespace-pre-wrap">
                  {message.content}
                </div>
                
                {/* action buttons shown on hover */}
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {/* copy button */}
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
                  
                  {/* edit button - only show if not currently generating */}
                  {!isGenerating && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleEdit}
                            className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                          >
                            <Edit2 size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit message</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  
                  {/* delete button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleDelete}
                          className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete message</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* regenerate button - only show if this is the last user message */}
                  {isLastUserMessage && !isGenerating && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleRegenerate}
                            className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                          >
                            <RefreshCw size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Regenerate response</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  
                  {/* disabled regenerate button when generating */}
                  {isLastUserMessage && isGenerating && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled
                            className="h-8 w-8 text-muted-foreground opacity-50"
                          >
                            <RefreshCw size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Cannot regenerate while generating</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
              
              {/* branch navigation controls - moved below the message */}
              {hasBranches && (
                <div className="flex items-center justify-end gap-1 mt-1 text-xs text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePreviousBranch}
                    className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted/50"
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  
                  <span>
                    {displayedBranchIndex}/{totalBranches}
                    {branchIndex === 0 && <span className="ml-1 font-medium">(current)</span>}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNextBranch}
                    className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted/50"
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>;
};

export default UserMessage;