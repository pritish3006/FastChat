import { useState, useCallback } from 'react';
import { useAppSelector } from '../store/hooks';
import { chatService } from '../services/chat.service';
import { ChatConfig } from '../types/chat';

export function useChat() {
  const [input, setInput] = useState('');
  const isGenerating = useAppSelector((state) => state.chat.isGenerating);
  const messages = useAppSelector((state) => state.chat.sessions[0]?.messages || []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const message = input.trim();
    setInput('');
    await chatService.sendMessage(message);
  }, [input, isGenerating]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (isGenerating) return;
    await chatService.regenerateMessage(messageId);
  }, [isGenerating]);

  const handleStop = useCallback(async () => {
    await chatService.stopGeneration();
  }, []);

  const updateConfig = useCallback((config: Partial<ChatConfig>) => {
    chatService.setConfig(config);
  }, []);

  return {
    input,
    setInput,
    messages,
    isGenerating,
    handleInputChange,
    handleSubmit,
    handleRegenerate,
    handleStop,
    updateConfig,
  };
} 