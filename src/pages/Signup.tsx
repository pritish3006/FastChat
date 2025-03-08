
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { signUp, clearError } from '@/redux/features/authSlice';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { 
  TextField, 
  Button, 
  Paper, 
  CircularProgress, 
  InputAdornment,
  IconButton,
  Snackbar,
  Alert
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const Signup = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useSelector((state: RootState) => state.auth);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);
  
  const validatePasswords = () => {
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return false;
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validatePasswords()) {
      dispatch(signUp({ email, password, username }) as any);
    }
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
          <h1 className="text-3xl font-bold">Create an account</h1>
          <p className="text-muted-foreground mt-2">Sign up to start chatting with AI</p>
        </motion.div>
        
        <motion.div variants={itemVariants}>
          <Paper 
            elevation={0} 
            className="p-6 border rounded-lg"
          >
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <TextField
                  label="Username"
                  type="text"
                  fullWidth
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <User size={18} />
                      </InputAdornment>
                    ),
                  }}
                />
                
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
                
                <TextField
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  fullWidth
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  error={!!passwordError}
                  helperText={passwordError}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock size={18} />
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
                  {isLoading ? 'Signing up...' : 'Sign up'}
                </Button>
              </div>
            </form>
          </Paper>
        </motion.div>
        
        <motion.div 
          className="text-center mt-6"
          variants={itemVariants}
        >
          <p className="text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
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

export default Signup;
