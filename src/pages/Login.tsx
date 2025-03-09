
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { login, clearError, mockLogin } from '@/redux/features/authSlice';
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
  Box
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const Login = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useSelector((state: RootState) => state.auth);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  useEffect(() => {
    // Add logging to help debug the authentication state changes
    console.log('Auth state changed in Login component:', { isAuthenticated, isLoading });
    
    // Only navigate if authenticated and not loading
    if (isAuthenticated && !isLoading) {
      console.log('Redirecting to home from Login component');
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(login({ email, password }) as any);
  };

  const handleMockLogin = () => {
    console.log('Mock login button clicked');
    dispatch(mockLogin() as any);
  };
  
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
              onClick={handleMockLogin}
              className="py-3 border-primary/30 hover:bg-primary/5"
              startIcon={<TerminalSquare size={18} />}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Development Mode Login'}
            </Button>
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
