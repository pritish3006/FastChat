import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { setCurrentSession } from '@/lib/store/slices/chatSlice';
import ChatContainer from '@/components/chat/ChatContainer';
import { toast } from 'sonner';

const Chat = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { sessions } = useAppSelector(state => state.chat);

  // Set current session based on URL parameter
  useEffect(() => {
    if (sessionId) {
      // Add a small delay to allow the store to be updated with the new session
      const timeoutId = setTimeout(() => {
        const session = sessions.find(session => session.id === sessionId);
        if (session) {
          dispatch(setCurrentSession(sessionId));
        } else {
          // If session not found and we have other sessions, redirect to the first one
          if (sessions.length > 0) {
            const firstSession = sessions[0];
            dispatch(setCurrentSession(firstSession.id));
            navigate(`/chat/${firstSession.id}`, { replace: true });
            toast.error('Chat session not found, redirecting to latest chat');
          } else {
            // If no sessions exist, redirect to home
            navigate('/', { replace: true });
            toast.error('No chat sessions found');
          }
        }
      }, 100); // Small delay to ensure store is updated

      return () => clearTimeout(timeoutId);
    } else if (sessions.length > 0) {
      // If no session ID in URL, use the first session
      const firstSession = sessions[0];
      dispatch(setCurrentSession(firstSession.id));
      navigate(`/chat/${firstSession.id}`, { replace: true });
    }
  }, [sessionId, sessions, dispatch, navigate]);

  return <ChatContainer />;
};

export default Chat;
