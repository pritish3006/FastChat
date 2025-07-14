import React from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { setToolsMenuOpen, toggleTool, Tool } from '@/lib/store/slices/uiSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, Search, Code, Image, Settings, Bot } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const toolIcons = {
  'file-upload': FileUp,
  'web-search': Search,
  'code': Code,
  'image': Image,
  'settings': Settings,
  'bot': Bot,
} as const;

export function ToolsMenu() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(state => state.ui.isToolsMenuOpen);
  const tools = useAppSelector(state => state.ui.tools);

  const handleClickOutside = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      dispatch(setToolsMenuOpen(false));
    }
  };

  const handleToggleTool = (toolId: string) => {
    dispatch(toggleTool(toolId));
  };

  const menuVariants = {
    hidden: { 
      opacity: 0, 
      y: 10, 
      scale: 0.95,
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1],
      }
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        duration: 0.3,
        ease: [0, 0, 0.2, 1],
        staggerChildren: 0.05,
      }
    },
    exit: { 
      opacity: 0, 
      y: 10, 
      scale: 0.95,
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 1, 1],
      }
    }
  };

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      x: -20,
      transition: {
        duration: 0.2,
      }
    },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3,
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          onClick={handleClickOutside}
        >
          <motion.div
            className="absolute right-4 bottom-20 w-80 rounded-lg bg-card border shadow-lg"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={menuVariants}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <motion.div 
                className="text-lg font-semibold mb-2"
                variants={itemVariants}
              >
                Tools & Features
              </motion.div>
              
              <motion.div className="space-y-3">
                {tools.map((tool) => (
                  <motion.div 
                    key={tool.id}
                    variants={itemVariants}
                    className="flex items-start justify-between p-2 rounded-lg hover:bg-accent/10 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 text-primary">
                        {React.createElement(toolIcons[tool.icon as keyof typeof toolIcons], { size: 18 })}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {tool.name}
                          {tool.isComingSoon && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                              Soon
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {tool.description}
                        </div>
                      </div>
                    </div>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={tool.isEnabled}
                              onCheckedChange={() => handleToggleTool(tool.id)}
                              disabled={tool.isComingSoon}
                              aria-label={`Toggle ${tool.name}`}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {tool.isComingSoon 
                            ? 'Coming soon!'
                            : tool.isEnabled 
                              ? 'Disable feature' 
                              : 'Enable feature'
                          }
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div 
                className="mt-4 pt-4 border-t"
                variants={itemVariants}
              >
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => dispatch(setToolsMenuOpen(false))}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Advanced Settings
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ToolsMenu;

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
