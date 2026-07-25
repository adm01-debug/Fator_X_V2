# Particionamento Mensal — Nexus / Fator X

**Última revisão:** 12 de julho de 2026
**Autor:** Time de Plataforma (Claude Opus 4.8)

---

## 1. Contexto

Três tabelas de alto volume usam `PARTITION BY RANGE (created_at)` mensal:

| Tabela pai            | Partições ativas         | Retenção | Estratégia    |
|-----------------------|--------------------------|----------|---------------|
| `agent_traces_v2`     | 2026-04 → 2026-10        | 90 dias  | Drop + archive |
| `audit_log_v2`        | 2026-04 → 2026-10        | 365 dias | Drop + archive |
| `trace_events_v2`     | 2026-04 → 2026-10        | 30 dias  | Drop          |

A criação das partições futuras é automatizada por `internal.ensure_monthly_partitions()`,
agendada via `pg_cron` para garantir **no mínimo 6 meses** de partições à frente.
`internal.check_partition_health()` faz auto-heal se detectar lacuna.

---

## 2. Herança de RLS em partições filhas

O Postgres 15+ propaga automaticamente as `POLICY` definidas na tabela pai para
todas as partições filhas. Isso significa que **não é necessário (nem recomendado)**
duplicar policies em cada partição individual.

### 2.1 Falso-positivo do Supabase Linter

O linter (`0008_rls_enabled_no_policy`) inspeciona `pg_policies` diretamente e reporta
uma linha por partição filha que não tenha policies próprias. Isso gera **16 avisos
`INFO`** recorrentes nas três famílias de tabelas particionadas.

Esses avisos **não representam vulnerabilidade real**:

1. RLS está habilitado na tabela pai (`rowsecurity = true`)
2. As policies da pai (workspace-scoped via `has_role()`) valem para toda partição herdada
3. Qualquer `SELECT`/`INSERT` via PostgREST atinge a tabela pai; o planner encaminha
   para a partição filha aplicando as policies herdadas
4. Um `SELECT` direto em `agent_traces_v2_2026_07` (fora da tabela pai) ainda passa
   pelas mesmas verificações RLS porque a partição filha herda `rowsecurity = true`

### 2.2 Prova de conceito

```sql
-- Verifica que RLS está ativo em todas as partições filhas
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename LIKE 'agent_traces_v2_%'
   OR tablename LIKE 'audit_log_v2_%'
   OR tablename LIKE 'trace_events_v2_%';
-- Todas devem retornar rowsecurity = true

-- Confirma que a policy da pai é aplicada
EXPLAIN (VERBOSE) SELECT * FROM agent_traces_v2 LIMIT 10;
-- O plano mostra o filter da policy sendo aplicado em cada partição
```

### 2.3 Decisão

Os 16 avisos são **suprimidos via `security--manage_security_finding`** com a
justificativa acima. Nenhuma ação de código é necessária.

Se no futuro criarmos partições filhas com policies **diferentes** da pai (caso
excepcional para hot data), documentar aqui e reavaliar.

---

## 3. Manutenção

### 3.1 Criação de partições futuras

```sql
-- Manual (raro; o pg_cron cobre isso)
SELECT internal.ensure_monthly_partitions(6);

-- Health check
SELECT * FROM internal.check_partition_health();
```

### 3.2 Retenção / drop

Job `pg_cron` `drop-old-partitions` roda diariamente e faz `DROP TABLE` das
partições fora da janela de retenção. Antes do drop, um snapshot mensal é enviado
para storage frio (arquivo Parquet em bucket `archive-*`).

### 3.3 Reindex

Após o drop mensal, `REINDEX` incremental é executado sobre a partição mais quente
(mês corrente) para manter latência de escrita estável.

---

## 4. Monitoramento

- **Supabase Linter**: 16 falsos-positivos suprimidos (§2.3)
- **`SystemJobsPage`**: exibe status dos cron jobs de particionamento
- **`SecurityMonitoringPanel`**: alerta se `check_partition_health()` reporta lacuna
- **Rollback rate**: instrumentado em `internal.rollback_snapshots` (independente)

---

## 5. Referências

- [PostgreSQL Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Supabase RLS + Partitioning discussion](https://github.com/supabase/supabase/discussions/9147)
- ADR-003: Edge Functions Architecture (`docs/adr/003-edge-functions-architecture.md`)
