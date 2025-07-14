import React, { useState, useRef, useEffect } from 'react';
import { chatAPI } from '@/lib/api/chat/chat.api';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
}

export function ChatTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'chat' | 'agent'>('chat');
  const [useVoice, setUseVoice] = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage: Message = {
      id: uuidv4(),
      content: input,
      role: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsGenerating(true);

    try {
      const sessionId = 'test-session'; // In real app, this would come from session management
      const stream = chatAPI.streamMessage({
        content: input,
        sessionId,
        config: {
          endpoint: mode,
          modelId: mode === 'agent' ? 'gpt-4' : 'gpt-3.5-turbo',
          temperature: 0.7,
          maxTokens: 2000,
          useStream: true,
          useVoice,
          tools: {
            enabled: toolsEnabled,
            tools: toolsEnabled ? ['search', 'calculator'] : undefined
          }
        }
      });

      let assistantMessage: Message = {
        id: uuidv4(),
        content: '',
        role: 'assistant',
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      for await (const chunk of stream) {
        if (chunk.error) {
          toast.error(chunk.error);
          break;
        }

        if (chunk.type === 'content') {
          assistantMessage.content += chunk.content || '';
          setMessages(prev => [...prev.slice(0, -1), { ...assistantMessage }]);
        }

        if (chunk.done) {
          break;
        }
      }
    } catch (error) {
      toast.error('Failed to send message');
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Chat Test Interface</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label>Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(value: 'chat' | 'agent') => setMode(value)}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="chat" id="chat" />
                <Label htmlFor="chat">Chat</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="agent" id="agent" />
                <Label htmlFor="agent">Agent</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Agent Options */}
          {mode === 'agent' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="voice"
                  checked={useVoice}
                  onCheckedChange={setUseVoice}
                />
                <Label htmlFor="voice">Enable Voice</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="tools"
                  checked={toolsEnabled}
                  onCheckedChange={setToolsEnabled}
                />
                <Label htmlFor="tools">Enable Tools</Label>
              </div>
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="h-[400px] border rounded-md p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'bg-muted'
                  } max-w-[80%]`}
                >
                  {message.content}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="space-y-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              className="w-full"
            >
              {isGenerating ? 'Generating...' : 'Send'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 