
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { createNewSession } from '@/redux/features/chatSlice';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { Button } from '@mui/material';

const Index = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleStartChat = () => {
    dispatch(createNewSession());
    navigate('/chat');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }
    }
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-4 py-12"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="text-center max-w-3xl">
        <div className="bg-primary/10 p-3 rounded-full inline-flex mb-6">
          <MessageSquare size={32} className="text-primary" />
        </div>
        
        <motion.h1 
          className="text-4xl md:text-5xl font-bold mb-4"
          variants={itemVariants}
        >
          Welcome to your AI Assistant
        </motion.h1>
        
        <motion.p 
          className="text-xl text-muted-foreground mb-8"
          variants={itemVariants}
        >
          Interact with state-of-the-art AI models through a seamless, real-time interface
        </motion.p>
        
        <motion.div variants={itemVariants}>
          <Button
            variant="contained"
            size="large"
            onClick={handleStartChat}
            className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-lg"
            startIcon={<MessageSquare />}
          >
            Start Chatting
          </Button>
        </motion.div>
        
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16"
          variants={itemVariants}
        >
          <div className="p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-2">Personalized Experience</h3>
            <p className="text-muted-foreground">
              Access your conversation history and continue where you left off
            </p>
          </div>
          
          <div className="p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-2">Multiple Models</h3>
            <p className="text-muted-foreground">
              Choose from a variety of AI models to suit your specific needs
            </p>
          </div>
          
          <div className="p-6 rounded-lg border bg-card/50 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-2">Tools & Agents</h3>
            <p className="text-muted-foreground">
              Enhance capabilities with file upload, web search, code interpretation and more
            </p>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Index;
