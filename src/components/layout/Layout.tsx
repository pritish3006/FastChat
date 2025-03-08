
import React, { useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import { getSession } from '@/redux/features/authSlice';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, requireAuth = true }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useSelector((state: RootState) => state.auth);
  const { isSidebarOpen } = useSelector((state: RootState) => state.chat);

  useEffect(() => {
    dispatch(getSession() as any);
  }, [dispatch]);

  useEffect(() => {
    if (!isLoading && requireAuth && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate, requireAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-slow">
          <p className="text-lg font-medium text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return null; // Will navigate to login
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.4, 1] }}
            className="fixed md:relative z-40 h-full"
          >
            <Sidebar />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <motion.div 
          className="flex-1 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
};

export default Layout;
