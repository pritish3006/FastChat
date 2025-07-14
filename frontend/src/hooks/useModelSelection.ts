import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { updateCurrentModel } from '@/lib/store/slices/chatSlice';
import { modelsAPI } from '@/lib/api/models/models.api';
import { Model } from '@/lib/api/models/types';
import { toast } from 'sonner';

// Default model and timing constants
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const DEBOUNCE_INTERVAL = 2000; // 2 seconds between model changes

// Fallback models if API fails
const fallbackModels = [
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient for most tasks',
    isActive: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Advanced model with tools and higher reasoning capability',
    isActive: true,
  },
];

export function useModelSelection() {
  const dispatch = useAppDispatch();
  const { currentModel, currentSessionId } = useAppSelector(state => state.chat);
  const [models, setModels] = useState<Model[]>(fallbackModels);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(currentModel || DEFAULT_MODEL);
  const lastModelChangeTime = useRef(0);
  const initialized = useRef(false);

  // Load available models
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function loadModels() {
      try {
        setIsLoading(true);
        const availableModels = await modelsAPI.getModels();
        
        if (availableModels && availableModels.length > 0) {
          setModels(availableModels);
          
          // Validate current model against available models
          if (!selectedModel || !availableModels.some(m => m.id === selectedModel)) {
            const modelToUse = DEFAULT_MODEL;
            setSelectedModel(modelToUse);
          }
        }
      } catch (error) {
        console.error('Failed to load models:', error);
        // Fallback models are already set as initial state
      } finally {
        setIsLoading(false);
      }
    }

    loadModels();
  }, []);

  // Sync with Redux state when current model changes
  useEffect(() => {
    if (currentModel && currentModel !== selectedModel) {
      setSelectedModel(currentModel);
    }
  }, [currentModel]);

  // Model change handler - core function that updates a session's model
  const handleModelChange = useCallback(async (modelId: string) => {
    // Skip if it's the same model
    if (modelId === selectedModel) return;
    
    // Throttling to prevent rapid model changes
    const now = Date.now();
    if (now - lastModelChangeTime.current < DEBOUNCE_INTERVAL) {
      toast.info('Please wait a moment before switching models again');
      return;
    }
    
    // Update timestamp for throttling
    lastModelChangeTime.current = now;
    
    // Prepare UI feedback
    const model = models.find(m => m.id === modelId);
    if (!model) {
      toast.error(`Model ${modelId} not found`);
      return;
    }
    
    // Optimistically update UI
    setSelectedModel(modelId);
    
    try {
      // This dispatches to the Redux store and updates the session model via API
      await dispatch(updateCurrentModel(modelId)).unwrap();
      
      // Show success message
      toast.success(`Switched to ${model.name}`);
      
      // If we don't have a current session, log that as this will only affect future sessions
      if (!currentSessionId) {
        console.log('No active session - model change will apply to next session');
      }
    } catch (error: any) {
      // Revert UI on failure
      setSelectedModel(currentModel || DEFAULT_MODEL);
      toast.error(`Failed to switch model: ${error.message || 'Unknown error'}`);
    }
  }, [selectedModel, models, dispatch, currentModel, currentSessionId]);

  return {
    models,
    selectedModel,
    isLoading,
    handleModelChange
  };
} 