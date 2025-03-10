
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import { createNewSession, addMessage } from '@/redux/features/chatSlice';
import ChatContainer from '@/components/chat/ChatContainer';
import webSocketManager from '@/utils/webSocket';
import { v4 as uuidv4 } from 'uuid';

const Chat = () => {
  const dispatch = useDispatch();
  const { sessions, currentSessionId } = useSelector((state: RootState) => state.chat);

  // Initialize WebSocket connection
  useEffect(() => {
    // Initialize with mock server URL - it will run in mock mode
    webSocketManager.connect('https://mock-api.example.com');
    
    return () => {
      webSocketManager.disconnect();
    };
  }, []);

  // Create a new session and add mock messages if needed
  useEffect(() => {
    if (sessions.length === 0 || !currentSessionId) {
      // Create a new chat session
      dispatch(createNewSession());
      
      // After the session is created, add mock messages with a slight delay
      setTimeout(() => {
        const sessionId = sessions[0]?.id || currentSessionId;
        
        // First user message
        dispatch(addMessage({
          content: "Hey, can you help me write a function to calculate Fibonacci numbers in JavaScript?",
          role: 'user',
          chat_id: sessionId,
        }));
        
        // First AI response
        setTimeout(() => {
          dispatch(addMessage({
            content: "Sure, I'd be happy to help you write a function to calculate Fibonacci numbers in JavaScript. Here's a straightforward implementation:\n\n```javascript\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  \n  let a = 0;\n  let b = 1;\n  let temp;\n  \n  for (let i = 2; i <= n; i++) {\n    temp = a + b;\n    a = b;\n    b = temp;\n  }\n  \n  return b;\n}\n```\n\nThis is an iterative approach which is more efficient than the recursive solution for larger numbers. It has O(n) time complexity and O(1) space complexity.\n\nYou can use it like this:\n\n```javascript\nconsole.log(fibonacci(10)); // Output: 55\n```\n\nWould you like me to explain how this works or would you prefer a different implementation?",
            role: 'assistant',
            chat_id: sessionId,
          }));
          
          // Second user message
          setTimeout(() => {
            dispatch(addMessage({
              content: "That's great! Can you explain how the recursive version would work too?",
              role: 'user',
              chat_id: sessionId,
            }));
            
            // Second AI response
            setTimeout(() => {
              dispatch(addMessage({
                content: "Absolutely! Here's how you would implement a recursive version of the Fibonacci function:\n\n```javascript\nfunction fibonacciRecursive(n) {\n  // Base cases\n  if (n <= 0) return 0;\n  if (n === 1) return 1;\n  \n  // Recursive case: fib(n) = fib(n-1) + fib(n-2)\n  return fibonacciRecursive(n - 1) + fibonacciRecursive(n - 2);\n}\n```\n\nThis implementation directly translates the mathematical definition of Fibonacci numbers:\n- F(0) = 0\n- F(1) = 1\n- F(n) = F(n-1) + F(n-2) for n > 1\n\nThe recursive approach is elegant and easy to understand, but it has some significant drawbacks:\n\n1. **Performance Issues**: It has exponential time complexity O(2^n) because it recalculates the same values many times.\n\n2. **Stack Overflow**: For large values of n, you might encounter a stack overflow error due to too many recursive calls.\n\nTo improve the recursive version, you could use memoization (caching previously calculated values):\n\n```javascript\nfunction fibonacciMemoized(n, memo = {}) {\n  // Check if we've already calculated this value\n  if (memo[n] !== undefined) return memo[n];\n  \n  // Base cases\n  if (n <= 0) return 0;\n  if (n === 1) return 1;\n  \n  // Calculate and store the result\n  memo[n] = fibonacciMemoized(n - 1, memo) + fibonacciMemoized(n - 2, memo);\n  return memo[n];\n}\n```\n\nThis memoized version maintains the elegance of recursion while significantly improving performance to O(n) time complexity.\n\nIs there anything specific about these implementations you'd like me to explain further?",
                role: 'assistant',
                chat_id: sessionId,
              }));
            }, 500);
          }, 1000);
        }, 500);
      }, 100);
    }
  }, [dispatch, sessions, currentSessionId]);

  return <ChatContainer />;
};

export default Chat;
