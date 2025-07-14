-- Drop existing indices and table
DROP INDEX IF EXISTS message_embeddings_embedding_idx;
DROP INDEX IF EXISTS message_embeddings_metadata_session_id_idx;
DROP INDEX IF EXISTS message_embeddings_created_at_idx;
DROP TABLE IF EXISTS message_embeddings;

-- Recreate message embeddings table with proper structure
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY,  -- No default value, must match messages.id
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key relationship to messages table
  FOREIGN KEY (id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Re-create indices
-- Create index for vector similarity search using HNSW index (recommended by Supabase for pgvector)
CREATE INDEX IF NOT EXISTS message_embeddings_embedding_idx 
ON message_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Add session_id and metadata indices for faster filtering
CREATE INDEX IF NOT EXISTS message_embeddings_metadata_session_id_idx
ON message_embeddings USING GIN ((metadata->'session_id'));

-- Add timestamp index for time-based queries
CREATE INDEX IF NOT EXISTS message_embeddings_created_at_idx
ON message_embeddings (created_at);
