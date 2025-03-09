
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
import NotFound from "./pages/NotFound";
import Layout from "./components/layout/Layout";

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
 * Main App component
 * 
 * Sets up the application with:
 * - Redux store for state management
 * - Material UI theme
 * - React Query for data fetching
 * - Routing configuration
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
              <Route path="/" element={<Layout><Index /></Layout>} />
              <Route path="/chat" element={<Layout><Chat /></Layout>} />
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
