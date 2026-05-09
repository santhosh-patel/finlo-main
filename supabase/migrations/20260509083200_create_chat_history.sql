-- Add log_type to rate limit logs
ALTER TABLE public.ai_message_logs ADD COLUMN IF NOT EXISTS log_type TEXT NOT NULL DEFAULT 'chat';

-- Create chat sessions table
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    sender TEXT NOT NULL, -- 'user' | 'bot'
    text TEXT NOT NULL,
    chart_data JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to prevent conflicts
DROP POLICY IF EXISTS "Users can insert their own chat sessions" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "Users can view their own chat sessions" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "Users can update their own chat sessions" ON public.ai_chat_sessions;
DROP POLICY IF EXISTS "Users can delete their own chat sessions" ON public.ai_chat_sessions;

DROP POLICY IF EXISTS "Users can insert messages into their own sessions" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Users can view messages from their own sessions" ON public.ai_chat_messages;
DROP POLICY IF EXISTS "Users can delete messages from their own sessions" ON public.ai_chat_messages;

-- ai_chat_sessions policies
CREATE POLICY "Users can insert their own chat sessions" ON public.ai_chat_sessions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own chat sessions" ON public.ai_chat_sessions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions" ON public.ai_chat_sessions
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions" ON public.ai_chat_sessions
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ai_chat_messages policies
CREATE POLICY "Users can insert messages into their own sessions" ON public.ai_chat_messages
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view messages from their own sessions" ON public.ai_chat_messages
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages from their own sessions" ON public.ai_chat_messages
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.ai_chat_sessions s 
            WHERE s.id = session_id AND s.user_id = auth.uid()
        )
    );
