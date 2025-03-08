
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateMessage } from '@/redux/features/chatSlice';
import { Message } from '@/types';
import { motion } from 'framer-motion';
import { Edit2, Check, X } from 'lucide-react';
import { Paper, IconButton, TextField, Avatar } from '@mui/material';

interface UserMessageProps {
  message: Message;
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editedContent.trim() !== message.content) {
      dispatch(updateMessage({ id: message.id, content: editedContent.trim() }));
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  return (
    <div className="flex items-start gap-3 max-w-4xl">
      <Avatar
        sx={{ width: 36, height: 36 }}
        className="bg-primary text-primary-foreground"
      >
        U
      </Avatar>
      
      <div className="flex-1">
        <span className="text-sm font-medium">You</span>
        
        <motion.div
          layout
          className="mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {isEditing ? (
            <Paper className="p-3 rounded-lg" elevation={0}>
              <TextField
                multiline
                fullWidth
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                variant="standard"
                InputProps={{ disableUnderline: true }}
                autoFocus
              />
              
              <div className="flex justify-end gap-2 mt-2">
                <IconButton
                  size="small"
                  onClick={handleCancel}
                  className="text-muted-foreground"
                >
                  <X size={18} />
                </IconButton>
                
                <IconButton
                  size="small"
                  onClick={handleSave}
                  color="primary"
                  disabled={!editedContent.trim()}
                >
                  <Check size={18} />
                </IconButton>
              </div>
            </Paper>
          ) : (
            <Paper 
              className="p-3 rounded-lg bg-accent/5 border relative group" 
              elevation={0}
            >
              <div className="whitespace-pre-wrap">
                {message.content}
              </div>
              
              <IconButton
                size="small"
                onClick={handleEdit}
                className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
              >
                <Edit2 size={16} />
              </IconButton>
            </Paper>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default UserMessage;
