-- ============================================================================
-- Agenda o refresh da materialized view `knowledge_graph_health`
-- (auditoria 2026-11-27)
--
-- O card `KnowledgeGraphHealthCard.tsx:110-112` promete ao usuario:
--   "Sem dados ainda - a materialized view e atualizada 1x/dia pelo
--    agendador; o proximo ciclo preenche este card."
--
-- Medido no catalogo de producao: `cron.job` tem 25 jobs ativos e NENHUM
-- chama `refresh_knowledge_graph_health()`. A funcao existe, e
-- SECURITY DEFINER e service_role-only, mas nunca roda - entao a MV nunca
-- e atualizada e a promessa da tela e falsa.
--
-- Efeito hoje: `knowledge_graph_health` tem 0 linhas e
-- `knowledge_entities` tambem (0 entidades, 0 relacoes), ou seja o card
-- esta vazio por falta de dado, e ficaria desatualizado para sempre a
-- partir do primeiro grafo criado.
--
-- Idempotente: desagenda antes de agendar, para a migration poder rodar
-- de novo sem duplicar job.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-knowledge-graph-health-daily') THEN
      PERFORM cron.unschedule('refresh-knowledge-graph-health-daily');
    END IF;
    PERFORM cron.schedule(
      'refresh-knowledge-graph-health-daily',
      '20 3 * * *',
      'SELECT public.refresh_knowledge_graph_health();'
    );
  END IF;
END;
$$;