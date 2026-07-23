
CREATE TABLE public.notebook_note_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  collection_id UUID NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  title_pattern TEXT NOT NULL DEFAULT '{{title}}',
  body_md TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  scope TEXT NOT NULL DEFAULT 'notebook' CHECK (scope IN ('workspace','notebook')),
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_templates_ws ON public.notebook_note_templates(workspace_id);
CREATE INDEX idx_note_templates_col ON public.notebook_note_templates(collection_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_note_templates TO authenticated;
GRANT ALL ON public.notebook_note_templates TO service_role;

ALTER TABLE public.notebook_note_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_templates select workspace member"
  ON public.notebook_note_templates FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "note_templates insert workspace member"
  ON public.notebook_note_templates FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "note_templates update workspace member"
  ON public.notebook_note_templates FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "note_templates delete workspace member"
  ON public.notebook_note_templates FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()) AND is_builtin = FALSE);

CREATE TRIGGER trg_note_templates_updated_at
  BEFORE UPDATE ON public.notebook_note_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.notebook_notes
  ADD COLUMN IF NOT EXISTS note_date DATE NULL,
  ADD COLUMN IF NOT EXISTS is_daily BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_notes_daily_per_notebook
  ON public.notebook_notes(collection_id, note_date)
  WHERE is_daily = TRUE AND note_date IS NOT NULL;

CREATE TABLE public.notebook_note_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.notebook_notes(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT NULL,
  version_number INTEGER NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_versions_note ON public.notebook_note_versions(note_id, version_number DESC);
CREATE INDEX idx_note_versions_ws ON public.notebook_note_versions(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notebook_note_versions TO authenticated;
GRANT ALL ON public.notebook_note_versions TO service_role;

ALTER TABLE public.notebook_note_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_versions select workspace member"
  ON public.notebook_note_versions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "note_versions insert workspace member"
  ON public.notebook_note_versions FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "note_versions delete workspace member"
  ON public.notebook_note_versions FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.snapshot_note_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  IF (NEW.title IS DISTINCT FROM OLD.title) OR (NEW.body_md IS DISTINCT FROM OLD.body_md) THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
      FROM public.notebook_note_versions WHERE note_id = OLD.id;

    INSERT INTO public.notebook_note_versions
      (note_id, workspace_id, title, body_md, tags, version_number, created_by)
    VALUES (OLD.id, OLD.workspace_id, OLD.title, OLD.body_md, OLD.tags, v_next, auth.uid());

    DELETE FROM public.notebook_note_versions
     WHERE note_id = OLD.id
       AND id IN (
         SELECT id FROM public.notebook_note_versions
          WHERE note_id = OLD.id
          ORDER BY version_number DESC OFFSET 50
       );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_note_snapshot ON public.notebook_notes;
CREATE TRIGGER trg_note_snapshot
  BEFORE UPDATE ON public.notebook_notes
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_note_version();

INSERT INTO public.notebook_note_templates (workspace_id, collection_id, name, description, title_pattern, body_md, tags, scope, is_builtin)
SELECT DISTINCT w.id, NULL::uuid,
  'Daily Note',
  'Modelo padrão para nota diária com áreas de foco, tarefas e reflexões.',
  '{{date}}',
  E'# {{date}}\n\n## 🎯 Foco do dia\n- \n\n## ✅ Tarefas\n- [ ] \n\n## 📝 Notas\n\n## 🧠 Reflexões\n',
  ARRAY['daily']::text[],
  'workspace',
  TRUE
FROM public.workspaces w
ON CONFLICT DO NOTHING;

INSERT INTO public.notebook_note_templates (workspace_id, collection_id, name, description, title_pattern, body_md, tags, scope, is_builtin)
SELECT DISTINCT w.id, NULL::uuid,
  'Meeting Note',
  'Ata de reunião com participantes, agenda, decisões e próximos passos.',
  'Reunião — {{title}}',
  E'---\ndate: {{date}}\nparticipants: []\n---\n\n# {{title}}\n\n## 👥 Participantes\n- \n\n## 📋 Agenda\n- \n\n## ✅ Decisões\n- \n\n## 🚀 Próximos passos\n- [ ] \n',
  ARRAY['meeting']::text[],
  'workspace',
  TRUE
FROM public.workspaces w
ON CONFLICT DO NOTHING;
