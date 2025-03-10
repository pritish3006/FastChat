
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { setToolsMenuOpen, toggleToolEnabled } from '@/redux/features/uiSlice';
import { motion } from 'framer-motion';
import { FileUp, Search, Code, Image, CheckCircle, XCircle } from 'lucide-react';
import { Switch } from '@mui/material';

const ToolsMenu: React.FC = () => {
  const dispatch = useDispatch();
  const { availableTools } = useSelector((state: RootState) => state.ui);

  const handleClickOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      dispatch(setToolsMenuOpen(false));
    }
  };

  const getToolIcon = (iconName: string) => {
    switch (iconName) {
      case 'upload':
        return <FileUp size={16} />;
      case 'search':
        return <Search size={16} />;
      case 'code':
        return <Code size={16} />;
      case 'image':
        return <Image size={16} />;
      default:
        return null;
    }
  };

  const menuVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
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
      y: 10,
      scale: 0.95,
      transition: { 
        duration: 0.15,
        ease: "easeIn"
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-40 bg-transparent"
      onClick={handleClickOutside}
    >
      <motion.div
        className="absolute left-0 bottom-16 w-64 rounded-lg bg-card border shadow-lg"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={menuVariants}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3">
          <div className="text-sm font-medium mb-2">
            Available Tools
          </div>
          
          <div className="space-y-2">
            {availableTools.map((tool) => (
              <div 
                key={tool.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="text-primary">
                    {getToolIcon(tool.icon)}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{tool.name}</div>
                    <div className="text-xs text-muted-foreground">{tool.description}</div>
                  </div>
                </div>
                
                <Switch
                  size="small"
                  checked={tool.isEnabled}
                  onChange={() => dispatch(toggleToolEnabled(tool.id))}
                  color="primary"
                />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ToolsMenu;
