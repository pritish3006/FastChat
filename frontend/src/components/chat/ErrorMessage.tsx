import React from 'react';
import { Message } from '@/types';
import { AlertCircle } from 'lucide-react';
import { Paper, IconButton, Box } from '@mui/material';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { removeMessage } from '@/redux/features/chatSlice';

interface ErrorMessageProps {
    message: Message;
}

/**
 * ErrorMessage component displays system errors in chat w/ distinct styling and dismiss functionality
 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => {
    const dispatch = useDispatch();

    const handleDismiss = () => {
        dispatch(removeMessage(message.id));
    };

    return (
        <Box className="flex items-start gap-3 my-2 max-w-4xl w-full mx-auto">
            <motion.div
                className="w-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
            >
                <Paper className="p-3 bg-destructive/10 border border-destructive/30 border text-destructive rounded-lg relative" 
                       elevation={0}
                >
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="text-destructive flex-shrink-0" />
                        <div className="flex-1 text-sm font-medium">{message.content}</div>
                        <IconButton
                            size="small"
                            onClick={handleDismiss}
                            className="text-destructive/70 hover:text-destructive"
                            aria-label="dismiss error"
                        >
                            <X size={16} />
                        </IconButton>
                    </div>    
                </Paper>
            </motion.div>
        </Box>
    );
};

export default ErrorMessage;


