
import React, { useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/redux/store';
import { getSession, mockLogin } from '@/redux/features/authSlice';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Props for the Layout component
 * @property {React.ReactNode} children - Child components to render within the layout
 * @property {boolean} requireAuth - Whether authentication is required to access this layout
 */
interface LayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

// Set this to false to disable auto mock login in development mode
// Users can still use the mock login button on the login page
const AUTO_MOCK_LOGIN = false;

/**
 * Main layout component
 * 
 * Handles:
 * - Authentication checks and redirects
 * - Layout structure (header, sidebar, main content)
 * - Authentication-based access control
 * 
 * @param {LayoutProps} props - Component props
 * @returns {React.ReactElement} The rendered layout
 */
const Layout: React.FC<LayoutProps> = ({ children, requireAuth = true }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
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
      user,
      currentPath: location.pathname
    });

    // Only handle redirects when loading is complete
    if (!isLoading) {
      if (requireAuth && !isAuthenticated) {
        if (AUTO_MOCK_LOGIN) {
          // Auto-login with mock user in development
          console.log('Auto mock login triggered');
          dispatch(mockLogin() as any);
        } else {
          // If not authenticated and we require auth, redirect to login
          console.log('Redirecting to login from Layout');
          // Avoid potential redirect loops by checking current path
          if (location.pathname !== '/login') {
            navigate('/login', { replace: true });
          }
        }
      } else if (!requireAuth && isAuthenticated) {
        // If authenticated and on a non-auth required page (like login), redirect to home
        console.log('Authenticated user on non-auth page, redirecting to home');
        navigate('/', { replace: true });
      }
    }
  }, [isAuthenticated, isLoading, navigate, requireAuth, dispatch, location.pathname]);

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
