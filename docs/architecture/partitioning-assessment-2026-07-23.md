# Assessment de Particionamento — 23/07/2026

**Autor:** Time de Plataforma (Claude Opus 4.8)
**Contexto:** Avaliar quais tabelas do schema `public` justificam particionamento hoje e estender a cobertura das já particionadas para 12 meses à frente.

---

## 1. Estado atual

Três famílias já usam `PARTITION BY RANGE (created_at)` mensal com pg_cron:

| Tabela pai        | Cobertura antes | Cobertura depois       | Retenção |
|-------------------|-----------------|------------------------|----------|
| `agent_traces_v2` | 2026-04 → 2027-01 | **2026-04 → 2027-07**  | 90 dias  |
| `audit_log_v2`    | 2026-04 → 2027-01 | **2026-04 → 2027-07**  | 365 dias |
| `trace_events_v2` | 2026-04 → 2027-01 | **2026-04 → 2027-07**  | 30 dias  |

`internal.ensure_monthly_partitions(p_months_ahead int DEFAULT 12)` agora aceita janela parametrizável (mantém compatibilidade com o call-site legado, que passa a criar 12 meses ao invés de 6). O job `pg_cron` `ensure-monthly-partitions` roda no dia 1 de cada mês às 03:00 UTC com `p_months_ahead => 12`.

## 2. Candidatas avaliadas para novo particionamento

Verificado em 23/07/2026 — todas as candidatas de alto volume potencial estão **vazias**:

| Tabela                        | Linhas | Tem `created_at` | Decisão |
|-------------------------------|--------|------------------|---------|
| `usage_records`               | 0      | sim              | **Adiar** |
| `agent_usage`                 | 0      | sim              | **Adiar** |
| `openclaw_whatsapp_messages`  | 0      | sim              | **Adiar** |
| `openclaw_events`             | 1      | sim              | **Adiar** |
| `code_executions`             | 0      | sim              | **Adiar** |
| `automation_logs`             | 0      | sim              | **Adiar** |
| `webhook_events`              | 0      | sim              | **Adiar** |
| `synthetic_results`           | 0      | sim              | **Adiar** |
| `oracle_history`              | 0      | sim              | **Adiar** |
| `agent_memories_v2`           | 0      | sim              | **Adiar** |
| `graph_executions`            | 0      | sim              | **Adiar** |
| `agent_traces` (legado)       | 0      | sim              | **Reter** — substituído por `agent_traces_v2` |
| `audit_log` (legado)          | 0      | sim              | **Reter** — substituído por `audit_log_v2` |

### Por que adiar

1. **Custo zero em ficar como está.** Nenhuma tabela candidata excede 100 kB; o planner não se beneficia de particionamento em datasets desse porte.
2. **Restrição de FK single-column.** Postgres exige a chave de partição na PK/UNIQUE. Se convertermos, por exemplo, `openclaw_whatsapp_messages` para `PARTITION BY RANGE (created_at)`, a PK precisa incluir `created_at` — o que quebra qualquer FK externa que referencie apenas `id` e invalida `ON DELETE CASCADE` em cadeias já existentes.
3. **Complexidade de migração online.** Converter tabela vazia é barato; converter tabela com FK apontando para ela exige recriar a FK como `(id, created_at)` composta em todos os pais — retrabalho evitável enquanto a tabela está fria.

### Gatilhos que disparam particionamento futuro

Documento como **critério objetivo** para reavaliação (monitorado em `SystemJobsPage`):

- Tamanho total ≥ **5 GB** ou linhas ≥ **10 M**, **ou**
- Latência P95 de `SELECT ... WHERE created_at > now() - '7 days'` ≥ **500 ms** com índice, **ou**
- Retenção legal/operacional exige `DROP` mensal (evitar `DELETE` que gera bloat).

Quando qualquer gatilho for atingido, seguir o **Playbook §3**.

## 3. Playbook — converter tabela existente em particionada preservando FKs

Aplica-se quando uma candidata acima cruzar o gatilho.

```sql
BEGIN;

-- 3.1 Renomeia a tabela original
ALTER TABLE public.<tabela> RENAME TO <tabela>_legacy;

-- 3.2 Cria nova tabela particionada com PK composta (id, created_at)
CREATE TABLE public.<tabela> (
  LIKE public.<tabela>_legacy INCLUDING ALL EXCLUDING CONSTRAINTS EXCLUDING INDEXES
) PARTITION BY RANGE (created_at);

ALTER TABLE public.<tabela>
  ADD PRIMARY KEY (id, created_at);

-- 3.3 Recria FKs de saída como compostas quando o pai é este.
--     Para FKs de entrada (outras tabelas apontando p/ esta), recriar como
--     (foreign_id, foreign_created_at) — requer nova coluna denormalizada OU
--     manter a legacy como shadow read-only durante rampa.

-- 3.4 GRANTs, RLS e policies idênticos à legacy
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabela> TO authenticated;
GRANT ALL ON public.<tabela> TO service_role;
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;
-- ... reaplicar CREATE POLICY conforme legacy ...

-- 3.5 Registrar no ensure_monthly_partitions
--     Adicionar '<tabela>' ao array v_parents em internal.ensure_monthly_partitions
--     e chamar a função para materializar as partições -3..+12.

-- 3.6 Backfill em lotes
INSERT INTO public.<tabela>
SELECT * FROM public.<tabela>_legacy
WHERE created_at BETWEEN $1 AND $2;

-- 3.7 Cutover: swap de nomes ou views + DROP da legacy após validação.
COMMIT;
```

### Regra de ouro — FKs e `ON DELETE CASCADE`

- **FK saindo da tabela particionada** para pai regular: funciona sem alteração (o pai não precisa ser particionado).
- **FK entrando na tabela particionada** vinda de outra tabela: precisa referenciar `(id, created_at)`. Alternativa aceitável: **manter a FK apenas lógica** (via trigger `BEFORE INSERT/UPDATE`) e documentar no `docs/DATA-DICTIONARY.md`. `ON DELETE CASCADE` continua funcionando via trigger.
- **CASCADE dentro da mesma família particionada** (ex.: `trace_events_v2` → `agent_traces_v2`): já resolvido via chave composta `(trace_id, created_at)`.

## 4. Monitoramento contínuo

- `SystemJobsPage` mostra status do cron e alerta se `check_partition_health()` reportar lacuna.
- Métrica `pg_stat_user_tables.n_live_tup` das candidatas exportada semanalmente para reavaliar gatilhos.
- Este documento deve ser revisitado a cada 90 dias.

## 5. Referências

- `docs/architecture/partitioning.md` — estratégia base
- ADR-006: Dual-Client Architecture (`docs/adr/006-dual-client-architecture.md`)
- [PostgreSQL Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
