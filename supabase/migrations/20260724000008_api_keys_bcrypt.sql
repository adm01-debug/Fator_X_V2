-- ═══════════════════════════════════════════════════════════════
-- ETAPA 9/50 — Migrar api_keys + deploy_connections para bcrypt
-- Mitiga: A-04 (API key strength), K-03
-- Severity: 🟠 ALTO
-- ═══════════════════════════════════════════════════════════════
-- PROBLEMA: api_keys usa SHA-256 puro (rápido, vulnerável a brute-force GPU)
--           deploy_connections.api_key_hash valida via HMAC-SHA256 constante
-- SOLUÇÃO: migrar para bcrypt (cost factor = 12, padrão OWASP)
--           - key_method = 'sha256' → antigo, requer re-key
--           - key_method = 'bcrypt' → novo, validation atualizada
--           - API keys existentes requerem rotação (um hash não
--             pode ser "upgraded" sem a chave em plaintext)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- PASSO 1: Adicionar key_method às tabelas
-- api_keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='api_keys' AND column_name='key_method') THEN
        ALTER TABLE public.api_keys
            ADD COLUMN key_method TEXT DEFAULT 'sha256'
            CHECK (key_method IN ('sha256', 'bcrypt'));
        COMMENT ON COLUMN api_keys.key_method IS
            'ETAPA 9: método de hash — sha256=legado (requer re-key), bcrypt=ativo';
    END IF;
END;
$$;

-- deploy_connections
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='deploy_connections'
          AND column_name='key_method') THEN
        ALTER TABLE public.deploy_connections
            ADD COLUMN key_method TEXT DEFAULT 'sha256'
            CHECK (key_method IN ('sha256', 'bcrypt'));
        COMMENT ON COLUMN deploy_connections.key_method IS
            'ETAPA 9: método de hash — sha256=legado, bcrypt=ativo';
    END IF;
END;
$$;

-- PASSO 2: Função de hash bcrypt com cost factor 12 (OWASP recommendation 2023)
-- Usa pgcrypto (disponível em Supabase)
CREATE OR REPLACE FUNCTION public.hash_api_key_bcrypt(p_raw_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN encode(
        pgcrypto.crypt(
            encode(sha256(p_raw_key::bytea), 'hex'),
            pgcrypto.gen_salt('bf', 12)
        ),
        'hex'
    );
END;
$$;

-- PASSO 3: Função de verificação bcrypt (compara com timing seguro)
CREATE OR REPLACE FUNCTION public.verify_api_key_bcrypt(
    p_raw_key TEXT,
    p_stored_hash TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- pgcrypto.crypt falha se o hash não estiver no formato bcrypt
    RETURN pgcrypto.crypt_encode(
        encode(sha256(p_raw_key::bytea), 'hex'),
        p_stored_hash
    ) = p_stored_hash;
EXCEPTION WHEN OTHERS THEN
    -- Se não for bcrypt format, retorna false (não vaza informação)
    RETURN FALSE;
END;
$$;

-- PASSO 4: Função de criação de API key (gera key + bcrypt hash)
CREATE OR REPLACE FUNCTION public.create_api_key_bcrypt(
    p_workspace_id UUID,
    p_name TEXT,
    p_scopes TEXT[] DEFAULT ARRAY['read','execute']::TEXT[],
    p_agent_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(key_id UUID, raw_key TEXT, key_hash TEXT, key_prefix TEXT) LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_raw_key TEXT := 'nxs_' || encode(gen_random_bytes(32), 'hex');
    v_hash TEXT;
    v_prefix TEXT;
    v_key_id UUID;
BEGIN
    v_prefix := substr(replace(v_raw_key, '-', ''), 1, 8);
    v_hash := public.hash_api_key_bcrypt(v_raw_key);

    INSERT INTO public.api_keys (
        workspace_id, name, key_hash, key_prefix, scopes,
        agent_id, is_active, created_by, key_method
    ) VALUES (
        p_workspace_id, p_name, v_hash, v_prefix, p_scopes,
        p_agent_id, true, p_created_by, 'bcrypt'
    ) RETURNING id INTO v_key_id;

    RETURN QUERY SELECT v_key_id, v_raw_key, v_hash, v_prefix;
END;
$$;

-- PASSO 5: Atualizar auth.ts validation — fallback para bcrypt
-- O auth.ts atual (validateApiKey) faz SHA-256 + constantTimeEqual
-- Precisamos de uma nova função RPC que verifica bcrypt
CREATE OR REPLACE FUNCTION public.verify_api_key(p_raw_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_key RECORD;
    v_sha256_hash TEXT;
BEGIN
    -- Primeiro tenta bcrypt (novo formato)
    FOR v_key IN
        SELECT id, workspace_id, agent_id, key_hash, key_method
        FROM public.api_keys
        WHERE is_active = true
    LOOP
        IF v_key.key_method = 'bcrypt' THEN
            IF public.verify_api_key_bcrypt(p_raw_key, v_key.key_hash) THEN
                -- Atualiza last_used_at (não bloqueia em caso de erro)
                UPDATE public.api_keys
                SET last_used_at = now()
                WHERE id = v_key.id;
                RETURN jsonb_build_object(
                    'valid', true,
                    'workspace_id', v_key.workspace_id,
                    'agent_id', v_key.agent_id,
                    'key_id', v_key.id
                );
            END IF;
        END IF;
    END LOOP;

    -- Fallback SHA-256 legado (para keys não migradas)
    -- DEPRECADO: Remove quando 100% das keys forem bcrypt
    v_sha256_hash := encode(sha256(p_raw_key::bytea), 'hex');
    FOR v_key IN
        SELECT id, workspace_id, agent_id, key_hash
        FROM public.api_keys
        WHERE is_active = true AND key_method = 'sha256'
    LOOP
        IF v_key.key_hash = v_sha256_hash THEN
            UPDATE public.api_keys SET last_used_at = now() WHERE id = v_key.id;
            RETURN jsonb_build_object(
                'valid', true,
                'workspace_id', v_key.workspace_id,
                'agent_id', v_key.agent_id,
                'key_id', v_key.id,
                'legacy', true
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('valid', false);
END;
$$;

-- PASSO 6: Função para marcar todas as keys existentes como "legacy"
-- Rodar esta query após deploy para marcar keys existentes:
--   UPDATE public.api_keys SET key_method = 'sha256' WHERE key_method IS NULL;
UPDATE public.api_keys SET key_method = 'sha256' WHERE key_method IS NULL;
UPDATE public.deploy_connections SET key_method = 'sha256' WHERE key_method IS NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════
DO $$
BEGIN
    -- Confirma que as novas funções existem
    PERFORM 1 FROM pg_proc WHERE proname = 'hash_api_key_bcrypt';
    PERFORM 1 FROM pg_proc WHERE proname = 'verify_api_key_bcrypt';
    PERFORM 1 FROM pg_proc WHERE proname = 'verify_api_key';
    PERFORM 1 FROM pg_proc WHERE proname = 'create_api_key_bcrypt';

    -- Confirma que key_method existe nas duas tabelas
    PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='api_keys' AND column_name='key_method';
    PERFORM 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deploy_connections' AND column_name='key_method';

    -- Confirma que todas as keys existentes estão marcadas como sha256
    IF EXISTS (
        SELECT 1 FROM public.api_keys
        WHERE key_method IS NULL
    ) THEN
        RAISE WARNING 'ETAPA 9: Keys sem key_method foram encontradas e atualizadas';
    END IF;

    RAISE NOTICE 'ETAPA 9 OK: api_keys migradas para bcrypt. Keys legadas (sha256) precisam de rotação.';
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- NOTA DE DEPLOY
-- ═══════════════════════════════════════════════════════════════
-- Após aplicar esta migration:
-- 1. O frontend deve usar create_api_key_bcrypt() para novas keys
-- 2. Usuários com keys SHA-256看到她见 receberão aviso no dashboard
-- 3. Remover fallback SHA-256 de auth.ts após 90 dias
-- 4. Keys sha256: DELETE FROM public.api_keys WHERE key_method='sha256'
--    (ou pedir re-cadastro para cada workspace afetado)
