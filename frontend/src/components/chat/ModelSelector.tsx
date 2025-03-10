
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { setCurrentModel } from '@/redux/features/chatSlice';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2 } from 'lucide-react';

const ModelSelector: React.FC = () => {
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const { availableModels, currentModelId } = useSelector((state: RootState) => state.chat);

  const currentModel = availableModels.find(model => model.id === currentModelId);

  const handleSelectModel = (modelId: string) => {
    dispatch(setCurrentModel(modelId));
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-accent/20 hover:bg-accent/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className="font-medium">{currentModel?.name || 'Select Model'}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              className="absolute left-0 z-50 mt-2 w-56 origin-top-left rounded-md bg-card shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              <div className="py-1 divide-y divide-border">
                {availableModels.map((model) => (
                  <div
                    key={model.id}
                    className="px-3 py-2 flex items-center justify-between hover:bg-muted cursor-pointer"
                    onClick={() => handleSelectModel(model.id)}
                  >
                    <div>
                      <div className="text-sm font-medium">{model.name}</div>
                      {model.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {model.description}
                        </div>
                      )}
                    </div>
                    
                    {model.id === currentModelId && (
                      <CheckCircle2 size={16} className="text-primary" />
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModelSelector;
