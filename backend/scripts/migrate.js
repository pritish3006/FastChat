/**
 * database migration script
 * 
 * sets up database tables and initial schema.
 * intended to be run once during initial setup.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Check for required environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing required environment variables: SUPABASE_URL and SUPABASE_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  
  try {
    // Create users table (if using Row Level Security with auth)
    console.log('Creating users table...');
    const { error: usersError } = await supabase.rpc('create_users_table_if_not_exists');
    
    if (usersError) {
      throw new Error(`Failed to create users table: ${usersError.message}`);
    }
    
    // Create chat_sessions table
    console.log('Creating chat_sessions table...');
    const { error: sessionsError } = await supabase.rpc('create_chat_sessions_table_if_not_exists');
    
    if (sessionsError) {
      throw new Error(`Failed to create chat_sessions table: ${sessionsError.message}`);
    }
    
    // Create messages table
    console.log('Creating messages table...');
    const { error: messagesError } = await supabase.rpc('create_messages_table_if_not_exists');
    
    if (messagesError) {
      throw new Error(`Failed to create messages table: ${messagesError.message}`);
    }
    
    // Create branches table
    console.log('Creating branches table...');
    const { error: branchesError } = await supabase.rpc('create_branches_table_if_not_exists');
    
    if (branchesError) {
      throw new Error(`Failed to create branches table: ${branchesError.message}`);
    }
    
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migrations
runMigrations(); 