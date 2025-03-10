
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { clearError, setUser } from '@/redux/features/authSlice';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Mail, Lock, ArrowRight, TerminalSquare } from 'lucide-react';
import { 
  TextField, 
  Button, 
  Paper, 
  CircularProgress, 
  InputAdornment,
  IconButton,
  Snackbar,
  Alert,
  Divider,
  Box,
  Typography
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { createMockUser } from '@/utils/authHelpers';

/**
 * Login Page Component
 * 
 * Provides user authentication functionality including:
 * - Standard email/password login
 * - Development mode login for testing without real authentication
 * - Form validation and error handling
 * - Automatic redirection when authenticated
 */
const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useSelector((state: RootState) => state.auth);
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  /**
   * Effect to handle redirection when user becomes authenticated
   * Redirects to home page when authentication completes
   */
  useEffect(() => {
    // Add logging to help debug the authentication state changes
    console.log('Auth state changed in Login component:', { 
      isAuthenticated, 
      isLoading
    });
    
    // Only navigate if authenticated and not loading
    if (isAuthenticated && !isLoading) {
      console.log('Redirecting to home from Login component');
      // Navigate to home page with a slight delay to ensure state is updated
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 100);
    }
  }, [isAuthenticated, isLoading, navigate]);
  
  /**
   * Handles form submission for email/password login
   * @param {React.FormEvent} e - The form submission event
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempted with:', { email, password });
    // Authentication functionality removed temporarily
  };

  /**
   * Handles development mode login
   * Creates a mock user session for testing without real authentication
   */
  const handleDevModeLogin = () => {
    console.log('Dev mode login button clicked');
    
    // Create a mock user and set it in the state
    const mockUser = createMockUser();
    dispatch(setUser(mockUser));
    
    // We'll manually navigate after a short delay to ensure the state is updated
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 300);
  };
  
  // Animation variants for page elements
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        className="w-full max-w-md"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div 
          className="text-center mb-8"
          variants={itemVariants}
        >
          <div className="bg-primary/10 p-3 rounded-full inline-flex mb-4">
            <MessageSquare size={32} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to continue to your chats</p>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Paper 
            elevation={0} 
            className="p-6 border rounded-lg"
          >
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <TextField
                  label="Email"
                  type="email"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Mail size={18} />
                      </InputAdornment>
                    ),
                  }}
                />
                
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock size={18} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
                
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isLoading}
                  className="bg-primary hover:bg-primary/90 py-3"
                  endIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <ArrowRight />}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </div>
            </form>

            <Box sx={{ my: 3 }}>
              <Divider>
                <span className="text-xs text-muted-foreground px-2">OR</span>
              </Divider>
            </Box>

            <Button
              variant="outlined"
              fullWidth
              onClick={handleDevModeLogin}
              className="py-3 border-primary/30 hover:bg-primary/5"
              startIcon={<TerminalSquare size={18} />}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Development Mode Login'}
            </Button>

            {process.env.NODE_ENV === 'development' && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                Bypasses authentication for faster development
              </Typography>
            )}
          </Paper>
        </motion.div>
        
        <motion.div 
          className="text-center mt-6"
          variants={itemVariants}
        >
          <p className="text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </motion.div>
      </motion.div>
      
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => dispatch(clearError())}
      >
        <Alert 
          onClose={() => dispatch(clearError())} 
          severity="error"
        >
          {error}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default Login;
