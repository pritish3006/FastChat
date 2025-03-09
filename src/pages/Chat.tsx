
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import { createNewSession } from '@/redux/features/chatSlice';
import ChatContainer from '@/components/chat/ChatContainer';

const Chat = () => {
  const dispatch = useDispatch();
  const { sessions, currentSessionId } = useSelector((state: RootState) => state.chat);

  // If there's no current session, create a new one
  useEffect(() => {
    if (sessions.length === 0 || !currentSessionId) {
      dispatch(createNewSession());
    }
  }, [dispatch, sessions, currentSessionId]);

  return <ChatContainer />;
};

export default Chat;
