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

  const sidebarVariants = {
    hidden: {
      x: '-100%',
      opacity: 0,
      transition: {
        duration: 0.05,
        ease: [0.03, 0, 0.02, 1]
      }
    },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        duration: 0.05,
        ease: [0.03, 0, 0.02, 1]
      }
    }
  };

  const backdropVariants = {
    hidden: {
      opacity: 0,
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.2,
        ease: [0, 0, 0.2, 1]
      }
    }
  };

  const mainContentVariants = {
    hidden: {
      opacity: 0,
      scale: 0.98,
      transition: {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.2,
        ease: [0, 0, 0.2, 1]
      }
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AnimatePresence mode="sync">
        {isSidebarOpen && (
          <>
            {/* Mobile backdrop */}
            <motion.div
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            />
            {/* Sidebar */}
            <motion.div
              variants={sidebarVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="fixed md:relative z-40 h-full"
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.main 
        className="flex-1 flex flex-col overflow-hidden"
        variants={mainContentVariants}
        initial="hidden"
        animate="visible"
      >
        <Header />
        <motion.div 
          className="flex-1 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ 
            duration: 0.2,
            ease: [0, 0, 0.2, 1]
          }}
        >
          {children}
        </motion.div>
      </motion.main>
    </div>
  );
};

export default Layout;
