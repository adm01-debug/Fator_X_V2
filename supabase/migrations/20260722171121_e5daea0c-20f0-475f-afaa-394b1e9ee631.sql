
CREATE TABLE IF NOT EXISTS public.citation_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID,
  notebook_id UUID,
  document_id UUID,
  chunk_id TEXT,
  citation_n SMALLINT NOT NULL,
  page INT,
  section TEXT,
  document_title TEXT,
  opened_document BOOLEAN NOT NULL DEFAULT false,
  dwell_ms INT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citation_telemetry_user ON public.citation_telemetry(user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_citation_telemetry_workspace ON public.citation_telemetry(workspace_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_citation_telemetry_doc ON public.citation_telemetry(document_id);
CREATE INDEX IF NOT EXISTS idx_citation_telemetry_chunk ON public.citation_telemetry(chunk_id);

GRANT SELECT, INSERT, UPDATE ON public.citation_telemetry TO authenticated;
GRANT ALL ON public.citation_telemetry TO service_role;

ALTER TABLE public.citation_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "citation_telemetry_own_select"
  ON public.citation_telemetry FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "citation_telemetry_own_insert"
  ON public.citation_telemetry FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "citation_telemetry_own_update"
  ON public.citation_telemetry FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
