-- Drop existing functions first (to avoid dependency issues)
DROP FUNCTION IF EXISTS get_user_token_usage;
DROP FUNCTION IF EXISTS get_session_token_usage;
DROP FUNCTION IF EXISTS get_token_usage_analytics;
DROP FUNCTION IF EXISTS validate_token_log;

-- Drop existing trigger
DROP TRIGGER IF EXISTS token_log_validation ON public.token_logs;

-- Drop existing table
DROP TABLE IF EXISTS public.token_logs;

-- Recreate token_logs table with proper constraints
CREATE TABLE IF NOT EXISTS public.token_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
    text_length INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_token_logs_session_id ON public.token_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_user_id ON public.token_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_message_id ON public.token_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_created_at ON public.token_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_token_logs_model ON public.token_logs(model);
CREATE INDEX IF NOT EXISTS idx_token_logs_metadata ON public.token_logs USING GIN (metadata);

-- Add function to get token usage by user
CREATE OR REPLACE FUNCTION get_user_token_usage(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_tokens BIGINT,
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    session_count INTEGER,
    message_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUM(token_count)::BIGINT as total_tokens,
        SUM(CASE WHEN role = 'user' THEN token_count ELSE 0 END)::BIGINT as prompt_tokens,
        SUM(CASE WHEN role = 'assistant' THEN token_count ELSE 0 END)::BIGINT as completion_tokens,
        COUNT(DISTINCT session_id)::INTEGER as session_count,
        COUNT(DISTINCT message_id)::INTEGER as message_count
    FROM 
        public.token_logs
    WHERE 
        user_id = p_user_id
        AND (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date);
END;
$$;

-- Add function to get token usage by session
CREATE OR REPLACE FUNCTION get_session_token_usage(
    p_session_id UUID
)
RETURNS TABLE (
    total_tokens BIGINT,
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    message_count INTEGER,
    model TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUM(token_count)::BIGINT as total_tokens,
        SUM(CASE WHEN role = 'user' THEN token_count ELSE 0 END)::BIGINT as prompt_tokens,
        SUM(CASE WHEN role = 'assistant' THEN token_count ELSE 0 END)::BIGINT as completion_tokens,
        COUNT(DISTINCT message_id)::INTEGER as message_count,
        MAX(model) as model
    FROM 
        public.token_logs
    WHERE 
        session_id = p_session_id
    GROUP BY 
        session_id;
END;
$$;

-- Add function to get token usage analytics by time period
CREATE OR REPLACE FUNCTION get_token_usage_analytics(
    p_interval TEXT DEFAULT 'day',
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    time_bucket TIMESTAMPTZ,
    total_tokens BIGINT,
    unique_users INTEGER,
    unique_sessions INTEGER,
    avg_tokens_per_message NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        date_trunc(p_interval, created_at) as time_bucket,
        SUM(token_count)::BIGINT as total_tokens,
        COUNT(DISTINCT user_id)::INTEGER as unique_users,
        COUNT(DISTINCT session_id)::INTEGER as unique_sessions,
        ROUND(AVG(token_count)::NUMERIC, 2) as avg_tokens_per_message
    FROM 
        public.token_logs
    WHERE 
        (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date)
    GROUP BY 
        time_bucket
    ORDER BY 
        time_bucket DESC;
END;
$$;

-- Recreate trigger to ensure token_logs entries match message data
CREATE OR REPLACE FUNCTION validate_token_log()
RETURNS TRIGGER AS $$
BEGIN
    -- Verify that the message exists and matches role and model
    IF NOT EXISTS (
        SELECT 1 
        FROM public.messages 
        WHERE id = NEW.message_id 
        AND role = NEW.role 
        AND model = NEW.model
    ) THEN
        RAISE EXCEPTION 'Invalid message reference: role or model mismatch';
    END IF;
    
    -- Verify that the message belongs to the specified session
    IF NOT EXISTS (
        SELECT 1 
        FROM public.messages 
        WHERE id = NEW.message_id 
        AND session_id = NEW.session_id
    ) THEN
        RAISE EXCEPTION 'Invalid message reference: session mismatch';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER token_log_validation
    BEFORE INSERT OR UPDATE ON public.token_logs
    FOR EACH ROW
    EXECUTE FUNCTION validate_token_log(); 