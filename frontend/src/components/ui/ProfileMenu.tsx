import React from 'react';
import { useDispatch } from 'react-redux';
import { setProfileMenuOpen } from '@/redux/features/uiSlice';
import { motion } from 'framer-motion';
import { 
  User, Settings, LogOut, Database, Bot, 
  ChevronRight, PanelLeft
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ProfileMenu: React.FC = () => {
  const dispatch = useDispatch();

  const handleSignOut = () => {
    // Sign out functionality removed temporarily
    console.log('Sign out clicked - functionality removed');
  };

  const handleClickOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      dispatch(setProfileMenuOpen(false));
    }
  };

  const menuVariants = {
    hidden: { opacity: 0, y: -10, scale: 0.95 },
    visible: { 
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { 
        duration: 0.2,
        ease: "easeOut"
      }
    },
    exit: { 
      opacity: 0,
      y: -10,
      scale: 0.95,
      transition: { 
        duration: 0.15,
        ease: "easeIn"
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-transparent"
      onClick={handleClickOutside}
    >
      <motion.div
        className="absolute right-4 top-14 w-64 rounded-lg bg-card border shadow-lg"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={menuVariants}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2">
          <div className="text-sm font-medium px-2 pt-2 pb-1 text-muted-foreground">
            Account
          </div>
          
          <button className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent/10 transition-colors text-left">
            <User size={16} className="text-primary" />
            <span>Account Information</span>
            <ChevronRight size={14} className="ml-auto text-muted-foreground" />
          </button>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent/10 transition-colors text-left opacity-50 cursor-not-allowed"
                  disabled
                >
                  <Database size={16} className="text-primary" />
                  <span>LLM Settings</span>
                  <ChevronRight size={14} className="ml-auto text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming Soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent/10 transition-colors text-left opacity-50 cursor-not-allowed"
                  disabled
                >
                  <Bot size={16} className="text-primary" />
                  <span>Configure Agents</span>
                  <ChevronRight size={14} className="ml-auto text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming Soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        <div className="border-t my-1"></div>
        
        <div className="p-2">
          <button className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent/10 transition-colors text-left">
            <Settings size={16} className="text-muted-foreground" />
            <span>Settings</span>
          </button>
          
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent/10 transition-colors text-left text-destructive"
          >
            <LogOut size={16} />
            <span>Log Out</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ProfileMenu;
