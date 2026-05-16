-- Create household goals table
CREATE TABLE IF NOT EXISTS public.household_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    target_amount NUMERIC(12,2) NOT NULL,
    current_amount NUMERIC(12,2) DEFAULT 0,
    deadline DATE,
    color TEXT DEFAULT 'primary',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.household_goals ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can manage household goals"
ON public.household_goals
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() 
        AND household_id = household_goals.household_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid() 
        AND household_id = household_goals.household_id
    )
);
