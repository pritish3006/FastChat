
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { store } from "./redux/store";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import Index from "./pages/Index";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import Layout from "./components/layout/Layout";
import { useSelector } from "react-redux";
import { RootState } from "./redux/store";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Create MUI theme to match our Tailwind design
 * Provides consistent styling across both MUI and Tailwind components
 */
const theme = createTheme({
  palette: {
    primary: {
      main: 'rgb(59, 130, 246)', // blue-500
    },
    secondary: {
      main: 'rgb(99, 102, 241)', // indigo-500
    },
    error: {
      main: 'rgb(239, 68, 68)', // red-500
    },
    background: {
      default: 'rgb(249, 250, 251)', // gray-50
    },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
  },
});

// Configure the React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * ProtectedRoute component
 * 
 * Ensures routes are only accessible when authenticated
 * Supports both regular authentication and development mode
 * Redirects to login when not authenticated
 * 
 * @param {object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render when authenticated
 * @returns {React.ReactElement} The protected route component
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, isDevMode } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  
  useEffect(() => {
    console.log('ProtectedRoute auth state:', { isAuthenticated, isLoading, isDevMode });
    
    if (!isLoading && !isAuthenticated) {
      console.log('Not authenticated, redirecting to login from ProtectedRoute');
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, isDevMode]);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse-slow">
          <p className="text-lg font-medium text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return null;
  }
  
  return <Layout>{children}</Layout>;
};

/**
 * PublicRoute component
 * 
 * For routes that don't require authentication
 * Redirects to home when already authenticated
 * 
 * @param {object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render for public routes
 * @returns {React.ReactElement} The public route component
 */
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isDevMode } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  
  useEffect(() => {
    console.log('PublicRoute auth state:', { isAuthenticated, isDevMode });
    
    if (isAuthenticated) {
      console.log('Already authenticated, redirecting to home from PublicRoute');
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate, isDevMode]);
  
  if (isAuthenticated) {
    return null;
  }
  
  return <>{children}</>;
};

/**
 * Main App component
 * 
 * Sets up the application with:
 * - Redux store for state management
 * - Material UI theme
 * - React Query for data fetching
 * - Routing configuration with auth-aware routes
 */
const AppWithProviders = () => (
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/chat" 
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/login" 
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                } 
              />
              <Route 
                path="/signup" 
                element={
                  <PublicRoute>
                    <Signup />
                  </PublicRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </Provider>
);

/**
 * App component wrapper
 * Separates provider setup from main component for cleaner organization
 * 
 * @returns {React.ReactElement} The root App component
 */
const App = () => <AppWithProviders />;

export default App;
