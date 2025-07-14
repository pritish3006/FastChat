import { useChat } from 'ai/react'
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks'
import { addMessage } from '@/lib/store/slices/chatSlice'
import { v4 as uuidv4 } from 'uuid'
import { MessageInput } from './MessageInput'
import { ScrollArea } from '@/components/ui/scroll-area'

export function LlamaChat() {
  const dispatch = useAppDispatch()
  const messages = useAppSelector((state) => state.chat.sessions[0]?.messages || [])
  const isGenerating = useAppSelector((state) => state.chat.isGenerating)

  const { input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    onFinish: (message) => {
      dispatch(addMessage({
        id: uuidv4(),
        content: message.content,
        role: 'assistant',
        timestamp: new Date().toISOString(),
      }))
    },
  })

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    dispatch(addMessage({
      id: uuidv4(),
      content: input,
      role: 'user',
      timestamp: new Date().toISOString(),
    }))

    handleSubmit(e)
  }

  const handleWebSearch = () => {
    // TODO: Implement web search functionality
    console.log('Web search clicked')
  }

  return (
    <div className="flex flex-col h-full relative">
      <ScrollArea className="flex-1 pb-[120px]">
        <div className="space-y-4 p-4 max-w-3xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-center'}
            >
              {message.role === 'user' ? (
                <div className="max-w-[80%] rounded-lg p-4 bg-slate-300 text-slate-900">
                  {message.content}
                </div>
              ) : (
                <div className="w-full max-w-2xl p-4">
                  {message.content}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <MessageInput
        input={input}
        isLoading={isLoading || isGenerating}
        onInputChange={handleInputChange}
        onSubmit={onSubmit}
        onWebSearch={handleWebSearch}
      />
    </div>
  )
} 