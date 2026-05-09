CREATE TABLE IF NOT EXISTS public.ai_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_message_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view/create their own logs
CREATE POLICY "Users can insert their own AI logs" ON public.ai_message_logs
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own AI logs" ON public.ai_message_logs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
