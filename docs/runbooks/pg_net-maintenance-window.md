# Runbook — Janela de Manutenção: `pg_net`

**Objetivo:** eliminar o warning do Supabase Linter *"Extension in Public"* movendo a extensão `pg_net` do schema `public` para o schema `extensions`, sem interromper webhooks nem jobs `pg_cron` que dependem de `net.http_post`.

> ⚠️ `pg_net` cria as funções `net.http_get / net.http_post / net.http_delete`, uma fila (`net.http_request_queue`) e um worker de background que roda em uma conexão dedicada. `DROP EXTENSION pg_net` derruba a fila e cancela requisições em voo. Por isso essa mudança **deve** ser feita em janela de manutenção.

## Impacto

| Componente | Impacto durante a janela |
|---|---|
| `cron.schedule(...)` que usam `net.http_post` | ⏸️ Pausados |
| Edge functions chamadas via HTTP direto | ✅ Sem impacto (não usam `pg_net`) |
| Triggers que chamam `net.http_post` | ❌ Falham durante ~30–120s |
| Consumers do `webhook-receiver` (entrada) | ✅ Sem impacto |
| `pg_cron` (schedule engine) | ✅ Sem impacto |

**Duração estimada:** 60–120 segundos.
**Janela sugerida:** dia útil, 03:00–03:30 UTC (00:00 BRT), tráfego mínimo.
**Responsável primário:** DBA / SRE de plantão.
**Aprovador:** Head of Engineering.

## Pré-requisitos

1. Backup lógico recente (`pg_dump` diário confirmado nas últimas 24h).
2. Inventário de dependências de `pg_net`:

```sql
-- Listar cron jobs que usam pg_net
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE command ILIKE '%net.http_%';

-- Listar funções/triggers que referenciam net.http_
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%net.http_%';
```

3. Comunicar em `#eng-changes` com 24h de antecedência.
4. Colocar `synthetic-runner` e `health-check` em modo *silent* (evitar alertas ruidosos).

## Passo a passo (executar via Supabase SQL Editor com role postgres/service_role)

```sql
-- 0) Pausar temporariamente os cron jobs dependentes.
UPDATE cron.job SET active = false
WHERE command ILIKE '%net.http_%';

-- 1) Drenar a fila (aguardar até 60s por requisições em voo).
DO $$
DECLARE remaining int;
BEGIN
  FOR i IN 1..12 LOOP
    SELECT count(*) INTO remaining FROM net.http_request_queue;
    EXIT WHEN remaining = 0;
    PERFORM pg_sleep(5);
  END LOOP;
END $$;

-- 2) Garantir o schema de extensões.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;

-- 3) Recriar a extensão no schema correto.
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 4) Compat: expor as funções no search_path padrão via alias no schema net
-- (o schema `net` é recriado automaticamente pela extensão — verificar).
SELECT n.nspname AS schema, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname LIKE 'http\_%';

-- 5) Reativar cron jobs.
UPDATE cron.job SET active = true
WHERE command ILIKE '%net.http_%';
```

## Verificação (smoke test)

```sql
-- Deve retornar um request_id imediatamente.
SELECT net.http_post(
  url := 'https://httpbin.org/post',
  body := '{"probe":"pg_net-maint"}'::jsonb,
  headers := '{"Content-Type":"application/json"}'::jsonb
);

-- Confirmar que o linter parou de acusar o warning.
-- Cloud → Advanced → Database Linter → esperar `0014_extension_in_public` = 0.
```

## Rollback

```sql
-- Restaurar rapidamente para o schema public em caso de regressão.
UPDATE cron.job SET active = false WHERE command ILIKE '%net.http_%';
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA public;
UPDATE cron.job SET active = true WHERE command ILIKE '%net.http_%';
```

## Pós-manutenção

- [ ] Rodar `supabase--linter` — confirmar 0 warnings.
- [ ] Consultar `webhook_events` últimas 15 min: 0 falhas atribuíveis a `pg_net`.
- [ ] Reabilitar alertas de `synthetic-runner` e `health-check`.
- [ ] Publicar postmortem curto em `docs/runbooks/history/`.

## Critérios de sucesso

- Linter reporta 0 ocorrências de `0014_extension_in_public`.
- `net.http_post` respondendo com `request_id` numérico em < 300ms.
- Nenhum cron job em estado `failed` nas 24h seguintes.

---

## Execução em staging (obrigatório antes de produção)

O projeto Lovable atual **não tem um ambiente staging separado provisionado** pela plataforma. Para executar o plano em staging com segurança, use uma das duas abordagens abaixo antes de aplicar em produção:

### Opção A — Projeto staging dedicado (recomendado)

1. Provisione um segundo projeto Supabase (via Lovable Cloud ou console) para servir como *staging permanente*.
2. Faça snapshot do schema atual (`pg_dump --schema-only`) e restaure no staging.
3. Popule dados sintéticos: `INSERT INTO webhook_events (...) SELECT ... FROM generate_series(1, 1000)` e alguns `cron.schedule(...)` de teste apontando para `net.http_post`.
4. Execute o script passo-a-passo desta runbook contra o staging.
5. Rode o smoke test + o job `edge-contracts` do CI apontado para a URL de staging (`VITE_SUPABASE_URL` sobrescrito).
6. Aguarde 24h e valide que nenhum cron job entrou em `failed`.
7. Só então agende a janela de produção.

### Opção B — Branch de banco (Supabase Database Branching)

Se a organização tiver Branching habilitado:

1. Crie um branch `pg_net-maintenance` do banco atual.
2. Execute o script no branch. O branch é isolado, então cron/webhooks reais não sofrem.
3. Valide `SELECT net.http_post(...)` e `SELECT * FROM cron.job WHERE active = false`.
4. Descarte o branch.
5. Aplique em produção via a janela agendada.

### Validação pós-staging

Antes de liberar produção, confirme no staging:

- [ ] `SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'pg_net'` retorna `extensions`.
- [ ] `supabase--linter` reporta 0 ocorrências de `0014_extension_in_public`.
- [ ] `webhook_events` últimas 15 min: 0 registros com `status = 'failed'` cuja causa seja timeout/connection.
- [ ] `retention_job_runs` (após 03:15 UTC) tem uma linha com `status = 'success'` e `partitions_dropped >= 0`.
- [ ] `security_alerts` categoria `retention_job_watchdog` sem alertas novos nas últimas 26h.

Se qualquer item falhar em staging, **abortar** a janela de produção e investigar antes de re-agendar.
