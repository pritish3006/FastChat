
import React, { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import UserMessage from './UserMessage';
import BotMessage from './BotMessage';
import MessageInput from './MessageInput';
import { motion, AnimatePresence } from 'framer-motion';
import { Message } from '@/types';
import webSocketManager from '@/utils/webSocket';

const ChatContainer: React.FC = () => {
  const dispatch = useDispatch();
  const { sessions, currentSessionId, isGenerating } = useSelector((state: RootState) => state.chat);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get the current chat session
  const currentSession = sessions.find(session => session.id === currentSessionId);
  const messages = currentSession?.messages || [];

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, messages[messages.length - 1]?.content]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Empty state for new chat
  if (messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <motion.div
            className="max-w-lg text-center px-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-semibold mb-3">How can I help you today?</h2>
            <p className="text-muted-foreground">
              Ask me anything, from answering questions to generating content and helping with tasks.
            </p>
          </motion.div>
        </div>
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((message: Message, index: number) => {
              const isUser = message.role === 'user';
              
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="mb-6"
                >
                  {isUser ? (
                    <UserMessage message={message} />
                  ) : (
                    <BotMessage 
                      message={message} 
                      isLastMessage={index === messages.length - 1}
                    />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </div>
      <MessageInput />
    </div>
  );
};

export default ChatContainer;
