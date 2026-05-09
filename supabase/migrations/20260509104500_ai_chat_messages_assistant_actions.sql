-- Maya / ask-data structured follow-up actions (add category / transaction suggestions)
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS assistant_actions JSONB DEFAULT NULL;

COMMENT ON COLUMN public.ai_chat_messages.assistant_actions IS
  'Structured suggestions from Maya: { categoriesToAdd?, transactionsToAdd? }; applied by user confirmation in-app.';
