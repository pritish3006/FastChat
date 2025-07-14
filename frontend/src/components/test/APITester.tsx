import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { chatAPI } from '@/lib/api/chat/chat.api';
import { ChatMessage, ChatSession } from '@/lib/api/chat/types';
import { Button } from '@/components/ui/button';
import { RootState } from '@/lib/store';
import { setIsGenerating } from '@/lib/store/slices/chatSlice';

export function APITester() {
  const dispatch = useDispatch();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const result = await chatAPI.getSessions();
      setSessions(result);
    } catch (err) {
      setError('Failed to load sessions');
      console.error(err);
    }
  };

  const handleSendMessage = async () => {
    setIsLoading(true);
    setError(null);
    dispatch(setIsGenerating(true));
    try {
      const response = await chatAPI.sendMessage({
        message: 'Hello, this is a test message!',
        config: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
        },
      });
      setMessages(prev => [...prev, response.data]);
    } catch (err) {
      setError('Failed to send message');
      console.error(err);
    } finally {
      setIsLoading(false);
      dispatch(setIsGenerating(false));
    }
  };

  const handleStreamMessage = async () => {
    setIsLoading(true);
    setError(null);
    setStreamingContent('');
    dispatch(setIsGenerating(true));
    try {
      const stream = chatAPI.streamMessage({
        message: 'Hello, this is a streaming test message!',
        config: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
        },
      });

      for await (const chunk of stream) {
        if (chunk.error) {
          throw new Error(chunk.error.message);
        }
        setStreamingContent(prev => prev + chunk.data.content);
      }
    } catch (err) {
      setError('Failed to stream message');
      console.error(err);
    } finally {
      setIsLoading(false);
      dispatch(setIsGenerating(false));
    }
  };

  const handleLoadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await chatAPI.getHistory({
        sessionId: sessions[0]?.id || 'mock-session-1',
      });
      setMessages(response.data.messages);
    } catch (err) {
      setError('Failed to load history');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!messages.length) return;
    setIsLoading(true);
    setError(null);
    dispatch(setIsGenerating(true));
    try {
      const response = await chatAPI.regenerateMessage({
        messageId: messages[messages.length - 1].id,
        sessionId: sessions[0]?.id || 'mock-session-1',
        config: {
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
        },
      });
      setMessages(prev => [...prev.slice(0, -1), response.data]);
    } catch (err) {
      setError('Failed to regenerate message');
      console.error(err);
    } finally {
      setIsLoading(false);
      dispatch(setIsGenerating(false));
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-4">API Tester</h1>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-x-2">
        <Button 
          onClick={handleSendMessage} 
          disabled={isLoading}
        >
          Send Message
        </Button>
        <Button 
          onClick={handleStreamMessage} 
          disabled={isLoading}
        >
          Stream Message
        </Button>
        <Button 
          onClick={handleLoadHistory} 
          disabled={isLoading}
        >
          Load History
        </Button>
        <Button 
          onClick={handleRegenerate} 
          disabled={isLoading || !messages.length}
        >
          Regenerate Last
        </Button>
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="text-blue-600">Loading...</div>
      )}

      {/* Streaming Content Display */}
      {streamingContent && (
        <div className="mt-4">
          <h2 className="font-semibold">Streaming Response:</h2>
          <div className="bg-gray-100 p-4 rounded">
            {streamingContent}
          </div>
        </div>
      )}

      {/* Messages Display */}
      <div className="mt-4">
        <h2 className="font-semibold">Messages:</h2>
        <div className="space-y-2">
          {messages.map((message) => (
            <div 
              key={message.id}
              className={`p-4 rounded ${
                message.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
              }`}
            >
              <div className="font-medium">{message.role}:</div>
              <div>{message.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions Display */}
      <div className="mt-4">
        <h2 className="font-semibold">Sessions:</h2>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="bg-gray-100 p-4 rounded">
              <div>ID: {session.id}</div>
              <div>Model: {session.modelId}</div>
              <div>Messages: {session.messages.length}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 