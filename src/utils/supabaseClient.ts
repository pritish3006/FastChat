
import { createClient } from '@supabase/supabase-js';

// Using the correct values for the FastChat project
const supabaseUrl = 'https://gsrreyvgrzgdsyjrbifn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcnJleXZncnpnZHN5anJiaWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0NjYzOTksImV4cCI6MjA1NzA0MjM5OX0.CE5a9BT-n9wvQN8PHg6RmHE1tLfixkEHCtv3afe1jyg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
