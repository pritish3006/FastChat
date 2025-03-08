
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client 
// In a real app, you'd use environment variables
const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseAnonKey = 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
