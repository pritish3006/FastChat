
import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Props for the Layout component
 * @property {React.ReactNode} children - Child components to render within the layout
 */
interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Main layout component
 * 
 * Handles:
 * - Layout structure (header, sidebar, main content)
 * 
 * @param {LayoutProps} props - Component props
 * @returns {React.ReactElement} The rendered layout
 */
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isSidebarOpen } = useSelector((state: RootState) => state.chat);

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
