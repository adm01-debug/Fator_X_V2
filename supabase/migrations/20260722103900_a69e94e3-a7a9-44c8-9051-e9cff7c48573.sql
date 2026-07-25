
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agent_skills','knowledge_entities','knowledge_relations',
    'oncall_schedule_emails','skill_registry','user_filter_preferences',
    'webhook_endpoints','workspace_member_emails'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I;
       CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t
    );
  END LOOP;
END $$;
