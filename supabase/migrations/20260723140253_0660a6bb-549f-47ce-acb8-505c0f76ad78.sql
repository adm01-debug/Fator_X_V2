
CREATE INDEX IF NOT EXISTS idx_slack_workspace_config_installed_by ON public.slack_workspace_config(installed_by);
CREATE INDEX IF NOT EXISTS idx_slack_channel_routes_created_by ON public.slack_channel_routes(created_by);
CREATE INDEX IF NOT EXISTS idx_document_ingestions_deduped_from ON public.document_ingestions(deduped_from);
CREATE INDEX IF NOT EXISTS idx_document_ingestions_document_id ON public.document_ingestions(document_id);
CREATE INDEX IF NOT EXISTS idx_notebook_notes_created_by ON public.notebook_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_links_created_by ON public.knowledge_links(created_by);
CREATE INDEX IF NOT EXISTS idx_notebook_podcasts_created_by ON public.notebook_podcasts(created_by);
ANALYZE public.slack_workspace_config, public.slack_channel_routes, public.document_ingestions, public.notebook_notes, public.knowledge_links, public.notebook_podcasts;
