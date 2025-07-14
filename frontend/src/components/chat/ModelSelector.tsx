/**
 * ModelSelector Component
 * 
 * A dropdown component for selecting between models like GPT-3.5 Turbo and GPT-4o Mini
 * Uses the useModelSelection hook for all logic and state management
 */

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModelSelection } from '@/hooks/useModelSelection';

export function ModelSelector() {
  // Get all state and handlers from our custom hook
  const { models, selectedModel, isLoading, handleModelChange } = useModelSelection();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading models...</span>
      </div>
    );
  }

  const selectedModelData = models.find(m => m.id === selectedModel);

  return (
    <Select
      value={selectedModel}
      onValueChange={handleModelChange}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue>
          {selectedModelData?.name || 'Select Model'}
        </SelectValue>
      </SelectTrigger>
      
      <SelectContent>
        <AnimatePresence>
          {models.map((model) => (
            <SelectItem
              key={model.id}
              value={model.id}
              className="relative py-2"
            >
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{model.name}</span>
                  {model.id === selectedModel && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                {model.description && (
                  <span className="text-xs text-muted-foreground">{model.description}</span>
                )}
              </motion.div>
            </SelectItem>
          ))}
        </AnimatePresence>
      </SelectContent>
    </Select>
  );
}

export default ModelSelector;
