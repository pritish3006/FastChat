
import React, { useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import { getSession, mockLogin } from '@/redux/features/authSlice';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

// Set this to true to enable auto mock login in development mode
// This is being set to false since we're using the button in Login page instead
const AUTO_MOCK_LOGIN = false;

const Layout: React.FC<LayoutProps> = ({ children, requireAuth = true }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useSelector((state: RootState) => state.auth);
  const { isSidebarOpen } = useSelector((state: RootState) => state.chat);

  // Check for existing session on component mount
  useEffect(() => {
    console.log('Layout mounting, checking session');
    dispatch(getSession() as any);
  }, [dispatch]);

  // Handle authentication requirements and redirects
  useEffect(() => {
    console.log('Auth state changed in Layout:', { 
      isAuthenticated, 
      isLoading, 
      requireAuth,
      user
    });

    // Only redirect when loading is complete
    if (!isLoading) {
      if (requireAuth && !isAuthenticated) {
        if (AUTO_MOCK_LOGIN) {
          // Auto-login with mock user in development
          console.log('Auto mock login triggered');
          dispatch(mockLogin() as any);
        } else {
          // If not authenticated and we require auth, redirect to login
          console.log('Redirecting to login from Layout');
          navigate('/login');
        }
      } else if (!requireAuth && isAuthenticated) {
        // If authenticated and on a non-auth required page (like login), redirect to home
        console.log('Authenticated user on non-auth page, redirecting to home');
        navigate('/');
      }
    }
  }, [isAuthenticated, isLoading, navigate, requireAuth, dispatch]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-slow">
          <p className="text-lg font-medium text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If auth is required but not authenticated, return null (will be redirected by useEffect)
  if (requireAuth && !isAuthenticated) {
    return null;
  }

  // Render the layout with sidebar and main content
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
