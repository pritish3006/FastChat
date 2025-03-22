/**
 * Index page - Landing/home page of the application
 * 
 * Features:
 * - Welcome message and quick start button
 * - Feature highlights with animations
 * - Responsive design
 * - Modern UI with shadcn components
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/lib/store/hooks';
import { createSession } from '@/lib/store/slices/chatSlice';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Sparkles,
  Bot,
  Search,
  Code,
  Upload,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const Index = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const handleStartChat = async () => {
    try {
      // Create a new session with default model
      await dispatch(createSession({ modelId: 'gpt-3.5-turbo' })).unwrap();
      navigate('/chat');
      toast.success('Chat session created');
    } catch (error) {
      toast.error('Failed to create chat session');
    }
  };

  // Animation variants
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

  // Feature cards data
  const features = [
    {
      icon: <Bot className="h-6 w-6 text-primary" />,
      title: "Multiple AI Models",
      description: "Choose from various AI models optimized for different tasks and requirements"
    },
    {
      icon: <Search className="h-6 w-6 text-primary" />,
      title: "Web Search",
      description: "Access real-time information from the web to enhance responses"
    },
    {
      icon: <Code className="h-6 w-6 text-primary" />,
      title: "Code Interpreter",
      description: "Execute and analyze code in multiple programming languages"
    },
    {
      icon: <Upload className="h-6 w-6 text-primary" />,
      title: "File Processing",
      description: "Upload and process various file types for analysis and interaction"
    }
  ];

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-background flex flex-col items-center justify-center p-4 md:p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div 
        className="text-center max-w-4xl mx-auto"
        variants={itemVariants}
      >
        {/* Hero section */}
        <motion.div 
          className="inline-flex items-center justify-center p-2 rounded-full bg-primary/10 mb-8"
          variants={itemVariants}
        >
          <Sparkles className="w-6 h-6 text-primary mr-2" />
          <span className="text-sm font-medium text-primary">
            Powered by Advanced AI
          </span>
        </motion.div>

        <motion.h1 
          className="text-4xl md:text-6xl font-bold tracking-tight mb-4"
          variants={itemVariants}
        >
          Your AI Assistant for
          <span className="text-primary"> Everything</span>
        </motion.h1>

        <motion.p 
          className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto"
          variants={itemVariants}
        >
          Experience seamless interaction with state-of-the-art AI models through our
          intuitive interface. Get instant help with writing, analysis, coding, and more.
        </motion.p>

        <motion.div 
          className="flex items-center justify-center gap-4 mb-16"
          variants={itemVariants}
        >
          <Button
            size="lg"
            onClick={handleStartChat}
            className="group"
          >
            Start Chatting
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </motion.div>

        {/* Features grid */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left"
          variants={itemVariants}
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              className="p-6 rounded-xl border bg-card hover:bg-accent/50 transition-colors"
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Index;
