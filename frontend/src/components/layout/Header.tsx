
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { toggleSidebar } from '@/redux/features/chatSlice';
import { toggleProfileMenu } from '@/redux/features/uiSlice';
import ModelSelector from '../chat/ModelSelector';
import ProfileMenu from '../ui/ProfileMenu';
import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Avatar } from '@mui/material';

const Header: React.FC = () => {
  const dispatch = useDispatch();
  const { isSidebarOpen } = useSelector((state: RootState) => state.chat);
  const { user } = useSelector((state: RootState) => state.auth);
  const { isProfileMenuOpen } = useSelector((state: RootState) => state.ui);

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

  return (
    <motion.header 
      className="sticky top-0 z-30 w-full px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/50"
      initial="hidden"
      animate="visible"
      variants={headerVariants}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="p-2 rounded-full hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <Menu size={22} />
          </button>
          
          <ModelSelector />
        </div>
        
        <div className="relative">
          <button
            onClick={() => dispatch(toggleProfileMenu())}
            className="relative rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Open profile menu"
          >
            <Avatar
              src={user?.avatar_url || undefined}
              alt={user?.username || "User"}
              sx={{ width: 36, height: 36 }}
              className="cursor-pointer transition-all hover:opacity-90 border border-border"
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
