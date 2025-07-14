/**
 * ErrorMessage Component
 * 
 * Displays error messages in chat with:
 * - Visual error indication
 * - Retry functionality
 * - Copy error details
 * - Animated transitions
 */
import React from 'react';
import { useAppDispatch } from '@/lib/store/hooks';
import { Message } from '@/lib/types/chat';
import { motion } from 'framer-motion';
import { AlertCircle, Copy, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ErrorMessageProps {
  message: Message;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  const dispatch = useAppDispatch();

  // Format timestamp for display
  const formatTimestamp = (timestamp: string): string => {
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch {
      return '';
    }
  };

  // Handle copying error message
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success('Error message copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy error message');
    }
  };

  // Handle retry action
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col space-y-2"
    >
      <div className="flex items-start gap-2 max-w-[85%] bg-destructive/10 text-destructive rounded-lg p-4">
        <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="font-medium">Error</div>
          <div className="text-sm text-destructive/90">{message.content}</div>
          
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy Details
            </Button>
            
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={handleRetry}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>

      {message.timestamp && (
        <div className="text-xs text-muted-foreground ml-2">
          {formatTimestamp(message.timestamp)}
        </div>
      )}
    </motion.div>
  );
}

export default ErrorMessage;


