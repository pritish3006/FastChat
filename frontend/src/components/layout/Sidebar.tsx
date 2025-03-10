import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { createNewSession, setCurrentSession, deleteSession } from '@/redux/features/chatSlice';
import { motion } from 'framer-motion';
import { PlusCircle, MessageCircle, Settings, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { IconButton, Tooltip } from '@mui/material';
const Sidebar: React.FC = () => {
  const dispatch = useDispatch();
  const {
    sessions,
    currentSessionId
  } = useSelector((state: RootState) => state.chat);
  const handleNewChat = () => {
    dispatch(createNewSession());
  };
  const handleSelectSession = (sessionId: string) => {
    dispatch(setCurrentSession(sessionId));
  };
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    dispatch(deleteSession(sessionId));
  };

  // Sort sessions by updated_at (newest first)
  const sortedSessions = [...sessions].sort((a, b) => b.updated_at - a.updated_at);
  const sidebarVariants = {
    hidden: {
      opacity: 0
    },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  };
  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -20
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.3
      }
    }
  };
  return <div className="h-full w-[260px] border-r flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4">
        <motion.button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-accent-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-sidebar-ring" whileHover={{
        scale: 1.02
      }} whileTap={{
        scale: 0.98
      }}>
          <PlusCircle size={18} />
          <span className="text-sm font-medium">New Chat</span>
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 bg-zinc-50">
        <motion.div className="space-y-1" variants={sidebarVariants} initial="hidden" animate="visible">
          {sortedSessions.length === 0 ? <div className="px-3 py-6 text-center text-muted-foreground text-sm">
              No chats yet. Start a new conversation!
            </div> : sortedSessions.map(session => <motion.div key={session.id} onClick={() => handleSelectSession(session.id)} className={`flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer group transition-colors ${currentSessionId === session.id ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50'}`} variants={itemVariants} whileHover={{
          x: 4
        }}>
                <div className="flex items-center space-x-3 overflow-hidden">
                  <MessageCircle size={16} className="shrink-0 opacity-70" />
                  <div className="truncate">
                    <span className="font-medium">{session.title}</span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(session.updated_at), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
                <Tooltip title="Delete chat">
                  <IconButton size="small" onClick={e => handleDeleteSession(e, session.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              </motion.div>)}
        </motion.div>
      </div>

      <div className="border-t p-4">
        <motion.button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg hover:bg-sidebar-accent/70 transition-colors text-sm font-medium" whileHover={{
        scale: 1.02
      }} whileTap={{
        scale: 0.98
      }}>
          <Settings size={16} />
          <span>Chat Settings</span>
        </motion.button>
      </div>
    </div>;
};
export default Sidebar;