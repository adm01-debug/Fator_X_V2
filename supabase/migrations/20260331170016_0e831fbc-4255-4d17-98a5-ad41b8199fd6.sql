DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_traces') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_traces;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'evaluation_runs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluation_runs;
  END IF;
END $$;