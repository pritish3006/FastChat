import React from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { toggleSidebar, createSession, setCurrentSession } from '@/lib/store/slices/chatSlice';
import { toggleProfileMenu } from '@/lib/store/slices/uiSlice';
import ModelSelector from '../chat/ModelSelector';
import ProfileMenu from '../ui/ProfileMenu';
import { motion } from 'framer-motion';
import { Menu, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const Header: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isSidebarOpen, currentModel } = useAppSelector(state => state.chat);
  const { user } = useAppSelector(state => state.auth);
  const { isProfileMenuOpen } = useAppSelector(state => state.ui);

  const headerVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.3, 
        ease: "easeOut" 
      }
    }
  };

  const handleNewChat = async () => {
    try {
      // Create new session with current model
      const result = await dispatch(createSession({ 
        title: 'New Chat' 
      })).unwrap();
      
      if (!result || !result.id) {
        throw new Error('Failed to create new session');
      }

      // Navigate to /chat first, let the Chat component handle the session
      navigate('/chat');
      toast.success('Started new chat session');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast.error('Failed to create new chat session');
    }
  };

  return (
    <motion.header 
      className="sticky top-0 z-30 w-full px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/50"
      initial="hidden"
      animate="visible"
      variants={headerVariants}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dispatch(toggleSidebar())}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isSidebarOpen ? "Close sidebar" : "Open sidebar"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewChat}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="New chat"
                >
                  <PlusCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>New chat</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <ModelSelector />
        </div>
        
        <div className="relative">
          <button
            onClick={() => dispatch(toggleProfileMenu())}
            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Open profile menu"
          >
            <Avatar
              className="h-9 w-9 cursor-pointer transition-all hover:opacity-90 border border-border"
            >
              {!user?.avatar_url && (user?.username?.[0] || user?.email?.[0] || "U")}
            </Avatar>
          </button>
          
          {isProfileMenuOpen && <ProfileMenu />}
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
