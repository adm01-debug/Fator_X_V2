
-- API Keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['read', 'execute'],
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure user_id exists even if the table was created by an earlier migration without it
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own api_keys" ON public.api_keys;
CREATE POLICY "Users can read own api_keys"
  ON public.api_keys FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own api_keys" ON public.api_keys;
CREATE POLICY "Users can create own api_keys"
  ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own api_keys" ON public.api_keys;
CREATE POLICY "Users can update own api_keys"
  ON public.api_keys FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own api_keys" ON public.api_keys;
CREATE POLICY "Users can delete own api_keys"
  ON public.api_keys FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'api_keys' AND indexname = 'idx_api_keys_user_id') THEN
    CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
