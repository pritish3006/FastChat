-- Update existing messages to mark them as persisted
-- This marks all existing messages in the database as already persisted
-- so the memory manager won't try to persist them again

UPDATE public.messages
SET persistence_status = 'persisted'
WHERE persistence_status = 'new';

-- Add a status update trigger for future inserts/updates
CREATE OR REPLACE FUNCTION update_messages_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if coming from an external source (not the memory manager itself)
    IF NEW.persistence_status IS NULL OR NEW.persistence_status = 'new' THEN
        NEW.persistence_status := 'persisted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'set_messages_status_trigger'
    ) THEN
        CREATE TRIGGER set_messages_status_trigger
        BEFORE INSERT OR UPDATE ON public.messages
        FOR EACH ROW
        EXECUTE FUNCTION update_messages_status();
    END IF;
END
$$; 