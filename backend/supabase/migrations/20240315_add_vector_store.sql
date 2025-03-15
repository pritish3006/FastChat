-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create message embeddings table for semantic search
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Optional relation to messages table if you have one
  -- FOREIGN KEY (id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS message_embeddings_embedding_idx 
ON message_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding VECTOR(1536),
  match_threshold FLOAT,
  match_count INT
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.content,
    me.metadata,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM
    message_embeddings me
  WHERE
    1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY
    me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add session_id and metadata indices for faster filtering
CREATE INDEX IF NOT EXISTS message_embeddings_metadata_session_id_idx
ON message_embeddings USING GIN ((metadata->'session_id'));

-- Add timestamp index for time-based queries
CREATE INDEX IF NOT EXISTS message_embeddings_created_at_idx
ON message_embeddings (created_at); 