
CREATE TABLE IF NOT EXISTS public.mcp_servers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'streamable-http' CHECK (transport IN ('streamable-http','sse','stdio')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','error')),
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools_discovered JSONB NOT NULL DEFAULT '[]'::jsonb,
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_connected TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure owner_id exists when table was created by an earlier migration without it
ALTER TABLE public.mcp_servers
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_connected TIMESTAMPTZ;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_servers TO authenticated;
GRANT ALL ON public.mcp_servers TO service_role;

ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their MCP servers" ON public.mcp_servers;
CREATE POLICY "Owners manage their MCP servers"
  ON public.mcp_servers FOR ALL
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS mcp_servers_owner_idx ON public.mcp_servers(owner_id);

DROP TRIGGER IF EXISTS update_mcp_servers_updated_at ON public.mcp_servers;
CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
