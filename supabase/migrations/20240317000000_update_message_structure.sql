-- Update messages table to better support memory management
ALTER TABLE IF EXISTS public.messages 
ADD COLUMN IF NOT EXISTS persistence_status TEXT DEFAULT 'new' CHECK (persistence_status IN ('new', 'persisted', 'archived'));

-- Ensure version column exists for message versioning
ALTER TABLE IF EXISTS public.messages
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add indexes for faster message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_branch_id ON public.messages(branch_id);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON public.messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_role ON public.messages(role);

-- Add index on metadata for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON public.messages USING GIN (metadata);

-- Add function to get message chain (for context retrieval)
CREATE OR REPLACE FUNCTION get_message_chain(
  p_message_id UUID,
  p_max_depth INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  role TEXT,
  parent_id UUID,
  branch_id UUID,
  depth INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY WITH RECURSIVE message_chain AS (
    -- Base case: the starting message
    SELECT 
      m.id, 
      m.content, 
      m.role, 
      m.parent_id, 
      m.branch_id,
      0 AS depth
    FROM 
      public.messages m
    WHERE 
      m.id = p_message_id
    
    UNION ALL
    
    -- Recursive case: get parent messages
    SELECT 
      m.id, 
      m.content, 
      m.role, 
      m.parent_id, 
      m.branch_id,
      mc.depth + 1
    FROM 
      public.messages m
    JOIN 
      message_chain mc ON m.id = mc.parent_id
    WHERE 
      mc.depth < p_max_depth
  )
  SELECT * FROM message_chain
  ORDER BY depth DESC; -- Order from oldest to newest
END;
$$;

-- Add a function to find recent messages by session
CREATE OR REPLACE FUNCTION get_recent_messages(
  p_session_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  role TEXT,
  parent_id UUID,
  model TEXT,
  created_at TIMESTAMPTZ,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id, 
    m.content, 
    m.role, 
    m.parent_id, 
    m.model,
    m.created_at,
    m.metadata
  FROM 
    public.messages m
  WHERE 
    m.session_id = p_session_id
    AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
  ORDER BY 
    m.created_at DESC
  LIMIT p_limit;
END;
$$; 