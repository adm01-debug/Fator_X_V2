-- 1. Funções de Suporte ao Particionamento
CREATE OR REPLACE FUNCTION public.create_partition_if_not_exists(
    t_name text,
    p_date timestamptz
) RETURNS void AS $$
DECLARE
    p_name text;
    start_date timestamptz;
    end_date timestamptz;
BEGIN
    start_date := date_trunc('month', p_date);
    end_date := start_date + interval '1 month';
    p_name := t_name || '_' || to_char(start_date, 'YYYY_MM');

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = p_name) THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            p_name, t_name, start_date, end_date);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Particionamento da Tabela audit_log
-- Criar nova estrutura particionada
CREATE TABLE IF NOT EXISTS public.audit_log_v2 (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Criar partição inicial (mês atual)
SELECT public.create_partition_if_not_exists('audit_log_v2', now());

-- Habilitar RLS e configurar políticas
ALTER TABLE public.audit_log_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_log_v2
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role_key = 'admin'));

-- Migrar dados existentes e substituir tabela antiga
INSERT INTO public.audit_log_v2 SELECT * FROM public.audit_log;
DROP TABLE public.audit_log CASCADE;
ALTER TABLE public.audit_log_v2 RENAME TO audit_log;

-- 3. Particionamento da Tabela agent_traces
CREATE TABLE IF NOT EXISTS public.agent_traces_v2 (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    agent_id UUID,
    user_id UUID,
    session_id TEXT,
    level public.trace_level DEFAULT 'info'::public.trace_level,
    event TEXT,
    input JSONB,
    output JSONB,
    metadata JSONB,
    latency_ms INTEGER,
    tokens_used INTEGER,
    cost_usd NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Criar partição inicial (mês atual)
SELECT public.create_partition_if_not_exists('agent_traces_v2', now());

-- Habilitar RLS e configurar políticas
ALTER TABLE public.agent_traces_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see their own traces" ON public.agent_traces_v2
    FOR SELECT USING (auth.uid() = user_id);

-- Migrar dados existentes e substituir tabela antiga
INSERT INTO public.agent_traces_v2 (id, agent_id, user_id, session_id, level, event, input, output, metadata, latency_ms, tokens_used, cost_usd, created_at)
SELECT id, agent_id, user_id, session_id, level, event, input, output, metadata, latency_ms, tokens_used, cost_usd, created_at
FROM public.agent_traces;
DROP TABLE public.agent_traces CASCADE;
ALTER TABLE public.agent_traces_v2 RENAME TO agent_traces;

-- 4. Triggers para Auto-particionamento
CREATE OR REPLACE FUNCTION public.trg_auto_partition()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.create_partition_if_not_exists(TG_TABLE_NAME::text, NEW.created_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_partition
    BEFORE INSERT ON public.audit_log
    FOR EACH ROW EXECUTE FUNCTION public.trg_auto_partition();

CREATE TRIGGER trg_agent_traces_partition
    BEFORE INSERT ON public.agent_traces
    FOR EACH ROW EXECUTE FUNCTION public.trg_auto_partition();
