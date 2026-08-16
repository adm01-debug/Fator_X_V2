# Auditoria de Estado — CAMADA DE DADOS (Fator X V2)

**Data:** 2026-08-16
**Escopo:** `supabase/migrations/` (326 arquivos, 27.844 linhas), `MIGRATION-COLAR-NO-SUPABASE.sql`, `src/integrations/supabase/types.ts`, `docs/DATA-DICTIONARY.md`, `docs/architecture/partitioning*.md`
**Auditor:** análise estática por objeto (sem acesso ao banco). Fatos de produção fornecidos pelo solicitante e tratados como verdade medida.

---

## 0. Método declarado

27.844 linhas está acima do teto de leitura integral. **Não** li migration por migration. O método foi:

1. **Inventário por objeto via ripgrep/grep** sobre os 326 arquivos, extraindo e deduplicando: `CREATE TABLE`, `CREATE [OR REPLACE] FUNCTION`, `CREATE VIEW`, `CREATE TRIGGER`, `CREATE POLICY`, `ENABLE/DISABLE ROW LEVEL SECURITY`, `CREATE INDEX`, `GRANT`, `REVOKE`, `ALTER DEFAULT PRIVILEGES`, `CREATE EXTENSION`, `cron.schedule`.
2. **Triangulação com uma terceira fonte**: `src/integrations/supabase/types.ts` é _gerado a partir do banco vivo_ (última regeneração de conteúdo: commit `dafaa64`, 2026-07-28). Ele funciona como um retrato independente do schema real e permite diferenças de conjunto contra o repositório.
3. **Set difference** entre (A) tabelas declaradas em migrations e (B) tabelas presentes em `types.ts`, nos dois sentidos.
4. **Leitura dirigida** (não integral) de ~12 arquivos-chave identificados pelo grep: o baseline, o `fix_stub_schemas`, a série `20260724000*` de RLS, o único `DISABLE ROW LEVEL SECURITY`, e as migrations que criam as 5 tabelas expostas ao `anon`.
5. **Arqueologia de git** (`git log --diff-filter=A`, `--format=%ad`) para datar a introdução dos arquivos e separar migrations _escritas à mão_ das _geradas pelo Lovable_ (padrão de nome UUID).

---

## 1. Reconciliação repo × banco — números agregados

| Objeto                     | Declarado no repo (distinto)                         | Em `types.ts` (gerado do banco, 2026-07-28) | Medido em produção       | Drift                        |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------- | ------------------------ | ---------------------------- |
| Tabelas `public`           | **236**                                              | 276                                         | **215**                  | −21 vs repo; +61 no types.ts |
| Tabelas `internal`         | 11                                                   | — (não exposto)                             | n/d                      | não verificável              |
| Funções `public` distintas | **180** (184 c/ `internal`)                          | 119                                         | **21 RPCs**              | **−159**                     |
| Views                      | **21** `public` (+3 `internal`)                      | 16                                          | **14**                   | −7                           |
| Triggers                   | **124** distintos                                    | —                                           | **2**                    | **−122**                     |
| Policies (par nome+tabela) | **384**, sobre 160 tabelas                           | —                                           | **58**, sobre 26 tabelas | **−326 / −134 tabelas**      |
| Tabelas com `ENABLE RLS`   | **222**                                              | —                                           | **39**                   | **−183**                     |
| `CREATE INDEX`             | 666 statements                                       | —                                           | n/d                      | não verificável              |
| Jobs `pg_cron`             | **11 nomes distintos** (40 chamadas `cron.schedule`) | —                                           | **0**                    | **−11**                      |
| Extensions                 | 4 (`vector`, `pg_trgm`, `pg_cron`, `pg_net`)         | —                                           | 9                        | +5 (defaults Supabase)       |
| Migrations                 | 326 arquivos                                         | —                                           | 318 aplicadas            | −8                           |

**Leitura:** o drift de migrations (8) é a métrica **menos** significativa deste relatório. Se 318 migrations tivessem de fato _executado_, o banco teria ~222 tabelas com RLS, ~124 triggers e ~180 funções. Tem 39, 2 e 21. **A contagem de linhas em `supabase_migrations.schema_migrations` não corresponde ao SQL que rodou.**

---

## 2. Tabela principal por objeto

| Objeto (tabela/RPC/view)                                                                                                                                                                                                                                                                        | Declarado no repo (arquivo:linha)                                                                                                                | Estado no banco                                     | Drift             | Observação                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `agents` (stub)                                                                                                                                                                                                                                                                                 | `20260330000001_schema_baseline.sql:16`                                                                                                          | existe, vazia                                       | schema divergente | Baseline cria **stub de 6 colunas**; o real tem dezenas. Ver §5.                                        |
| `agent_traces` (stub)                                                                                                                                                                                                                                                                           | `20260330000001_schema_baseline.sql:28`                                                                                                          | existe, vazia                                       | schema divergente | Stub de **1 coluna** (`id`).                                                                            |
| `notifications` (stub)                                                                                                                                                                                                                                                                          | `20260330000001_schema_baseline.sql:52`                                                                                                          | existe, vazia                                       | schema divergente | Stub de 1 coluna.                                                                                       |
| `user_roles` (stub)                                                                                                                                                                                                                                                                             | `20260330000001_schema_baseline.sql:58`                                                                                                          | existe, **1 linha**, **RLS OFF**, `anon` c/ escrita | crítico           | Stub de 1 coluna no baseline.                                                                           |
| `user_roles` (real)                                                                                                                                                                                                                                                                             | `20260416180547_...sql:60-69`                                                                                                                    | existe                                              | —                 | Migration Lovable, cria colunas reais.                                                                  |
| `user_roles` RLS                                                                                                                                                                                                                                                                                | `20260416180547_...sql:73` (`ENABLE ROW LEVEL SECURITY`, **sem guarda**)                                                                         | **RLS OFF**                                         | **não executou**  | Ver §4.                                                                                                 |
| `user_roles` policies (4)                                                                                                                                                                                                                                                                       | `20260416180547_...sql:96,101,105,110`                                                                                                           | ausentes                                            | **não executou**  | + `20260405000002_rbac_system.sql:90,98`                                                                |
| `roles`                                                                                                                                                                                                                                                                                         | `20260416180547_...sql:3` / `20260405000002:8` / `MIGRATION-COLAR:60`                                                                            | existe, 3 linhas, **RLS OFF**                       | crítico           | 3 declarações concorrentes em 3 fontes.                                                                 |
| `roles` RLS                                                                                                                                                                                                                                                                                     | `20260416180547_...sql:17`; `20260405000002_rbac_system.sql:73`                                                                                  | **OFF**                                             | não executou      |                                                                                                         |
| `workspaces`                                                                                                                                                                                                                                                                                    | `20260331110311_...sql:3`                                                                                                                        | existe, 3 linhas, RLS ON                            | ok                |                                                                                                         |
| `workspaces` RLS+policies                                                                                                                                                                                                                                                                       | `20260331110311_...sql:104,111,117`                                                                                                              | policies presentes                                  | ok                | Uma das poucas que "pegou".                                                                             |
| `workspace_members`                                                                                                                                                                                                                                                                             | `20260331110311_...sql:12`                                                                                                                       | existe, 3 linhas                                    | ok                | 24 arquivos criam policies para ela                                                                     |
| `workspace_members` RLS                                                                                                                                                                                                                                                                         | `20260331110311_...sql:105`                                                                                                                      | RLS ON                                              | ok                |                                                                                                         |
| `api_keys`                                                                                                                                                                                                                                                                                      | `20260405000001_shared_security_infrastructure.sql:42`; `20260405153936_...sql:3`; `MIGRATION-COLAR:25`                                          | existe, vazia, **RLS OFF**, `anon` c/ escrita       | **crítico**       |                                                                                                         |
| `api_keys` RLS                                                                                                                                                                                                                                                                                  | `20260405000001:62`; `20260405153936_...sql:20`                                                                                                  | **OFF**                                             | não executou      | Tabela de **chaves de API** sem RLS.                                                                    |
| `credential_vault`                                                                                                                                                                                                                                                                              | `20260405220001_automation_services.sql:140`                                                                                                     | existe, vazia, **RLS OFF**, `anon` c/ escrita       | **crítico**       | **Ausente de `types.ts`** — nunca entrou no schema que gerou os tipos.                                  |
| `credential_vault` RLS                                                                                                                                                                                                                                                                          | `20260405220001_automation_services.sql:166`                                                                                                     | **OFF**                                             | não executou      | Policy insegura original: `FOR ALL USING (auth.uid() IS NOT NULL)` (`:167`)                             |
| `credential_vault` RLS v2                                                                                                                                                                                                                                                                       | `20260724000002_rls_credential_vault.sql:48-70`                                                                                                  | ausente                                             | não executou      | Migration de correção; **não** contém `ENABLE ROW LEVEL SECURITY` — depende da anterior. Ver §4.3.      |
| `credential_audit_logs`                                                                                                                                                                                                                                                                         | `20260405220001_automation_services.sql`                                                                                                         | ausente de `types.ts`                               | fantasma          |                                                                                                         |
| `notification_templates`                                                                                                                                                                                                                                                                        | `20260726210258_...sql:186` (GRANT)                                                                                                              | existe, 1 linha                                     | ok                |                                                                                                         |
| `agent_permissions`                                                                                                                                                                                                                                                                             | `20260405000002_rbac_system.sql:103`(COLAR) / rbac                                                                                               | ausente de `types.ts`                               | **fantasma**      |                                                                                                         |
| `rate_limit_logs`                                                                                                                                                                                                                                                                               | `20260405000001_shared_security_infrastructure.sql`                                                                                              | ausente de `types.ts`                               | **fantasma**      |                                                                                                         |
| `workflow_checkpoints`                                                                                                                                                                                                                                                                          | `20260405210001_workflow_checkpointing.sql`                                                                                                      | ausente de `types.ts`                               | **fantasma**      |                                                                                                         |
| `workflow_executions`, `workflow_handoffs`, `workflow_step_runs`                                                                                                                                                                                                                                | `20260332000002_consolidated_schema_fixes.sql`                                                                                                   | ausentes de `types.ts`                              | **fantasmas**     |                                                                                                         |
| `data_subject_requests`, `data_breach_log`, `data_processing_register`, `data_retention_policies`, `personal_data_inventory`, `lgpd_settings`                                                                                                                                                   | `20260724000010_lgpd_required_tables.sql`                                                                                                        | ausentes de `types.ts`                              | **fantasmas**     | Todo o pacote LGPD é fantasma.                                                                          |
| `account_lockouts`, `ip_rate_limits`                                                                                                                                                                                                                                                            | `20260724000011_auth_attempts_hardening.sql`                                                                                                     | ausentes de `types.ts`                              | **fantasmas**     |                                                                                                         |
| `hf_config`, `finetune_jobs`                                                                                                                                                                                                                                                                    | `20260404210000_huggingface_phase4.sql`                                                                                                          | ausentes de `types.ts`                              | **fantasmas**     |                                                                                                         |
| `connector_registry`, `connector_instances`, `dead_letter_queue`, `batch_jobs`, `execution_history`, `installed_templates`, `automation_templates`                                                                                                                                              | `20260405220001_automation_services.sql`                                                                                                         | ausentes de `types.ts`                              | **fantasmas**     | 1 arquivo → 7 tabelas fantasma.                                                                         |
| `alert_rules`, `prompt_ab_tests`                                                                                                                                                                                                                                                                | `20260401200000_implement_all_features.sql`                                                                                                      | ausentes de `types.ts`                              | **fantasmas**     |                                                                                                         |
| `mcp_tools`                                                                                                                                                                                                                                                                                     | `20260332000002_consolidated_schema_fixes.sql`                                                                                                   | ausente de `types.ts`                               | **fantasma**      |                                                                                                         |
| `mcp_servers`                                                                                                                                                                                                                                                                                   | `20260405000003_mcp_servers.sql:?`; `MIGRATION-COLAR:197`; `20260712193727_...sql:26`                                                            | presente em `types.ts`                              | ok                | Criada pela migration Lovable, não pela escrita à mão.                                                  |
| `forensic_snapshots`                                                                                                                                                                                                                                                                            | **nenhuma migration**                                                                                                                            | presente em `types.ts`                              | **inverso**       | Existe no banco e **não é declarada** em lugar nenhum do repo.                                          |
| Partições `traces_*`, `spans_*`, `audit_log_v2_*`, `trace_events_v2_*`, `agent_traces_v2_*` (73)                                                                                                                                                                                                | criadas dinamicamente por `create_partition_if_not_exists` (`20260722104416_...sql:36`, `20260726211808_...sql:144`, `20260723141945_...sql:48`) | presentes em `types.ts`                             | não-drift         | Nomes não aparecem literalmente em nenhum `CREATE TABLE`; são geradas em runtime.                       |
| View `agent_daily_metrics`                                                                                                                                                                                                                                                                      | declarada em migrations e em `internal.`                                                                                                         | presente                                            | ok                |                                                                                                         |
| Views `forum_*_public`, `forum_*_safe`, `workspace_members_*`                                                                                                                                                                                                                                   | `20260416203442`, `20260418162623`, etc.                                                                                                         | presentes                                           | ok                | As 14 views vivas são majoritariamente estas.                                                           |
| Views `_audit_rls_automation`, `_audit_security_definer`, `knowledge_graph_health_v`, `slo_metrics_hourly`                                                                                                                                                                                      | declaradas                                                                                                                                       | ausentes de `types.ts`                              | **fantasmas**     |                                                                                                         |
| ~159 funções `public`                                                                                                                                                                                                                                                                           | 180 distintas declaradas                                                                                                                         | **21 RPCs**                                         | **drift massivo** | Inclui `user_has_permission`, `auto_assign_admin_role`, `is_workspace_admin`, `chunks_update_bm25` etc. |
| 122 triggers                                                                                                                                                                                                                                                                                    | 124 distintos declarados                                                                                                                         | **2**                                               | **drift massivo** | Inclui `trg_auto_assign_admin` (`MIGRATION-COLAR:193`) e `trg_chunks_bm25` (`:247`).                    |
| 11 jobs `pg_cron` (`lgpd-retention-daily`, `capture-perf-snapshot`, `cost-anomalies-15min`, `pg-net-smoke-hourly`, `check-db-bloat`, `cleanup-auth-attempts`, `lgpd-sar-deadline-check`, `lgpd-review-reminders`, `lgpd-cleanup-auth-attempts`, `cost-baselines-daily`, `prune-perf-snapshots`) | 40 chamadas `cron.schedule` em migrations                                                                                                        | **`cron.job` VAZIO**                                | **total**         | Nenhuma rotina de retenção/LGPD/observabilidade está rodando.                                           |

---

## 3. As 8 migrations não aplicadas — hipótese

**Não posso provar** quais 8 são (não tenho acesso a `supabase_migrations.schema_migrations`). Apresento candidatas ranqueadas por evidência documental.

### Verificações negativas que estreitam o campo

- Não há prefixos de versão duplicados (326 prefixos únicos de 14 dígitos) — o drift **não** vem de colisão de nomes.
- `.github/workflows/ci.yml` **não** contém nenhum passo `supabase db push` / `supabase migration`. **Não existe pipeline automatizado de aplicação de migrations.** Aplicação é 100% manual ou via Lovable.

### Candidata primária (evidência documental direta)

`NEXUS-RELATORIO-TESTES-ABRANGENTE.md:101` afirma textualmente:

> `5. **4 SQL migrations** pendentes no Supabase Dashboard — arquivo MIGRATION-COLAR-NO-SUPABASE.sql pronto`

O cabeçalho de `MIGRATION-COLAR-NO-SUPABASE.sql:2` confirma: _"NEXUS AGENTS STUDIO — 4 MIGRATIONS CONSOLIDADAS / Cole este SQL INTEIRO no Supabase Dashboard"_. As 4 são, por correspondência de conteúdo seção a seção:

1. `20260405000001_shared_security_infrastructure.sql` (seção 1/4)
2. `20260405000002_rbac_system.sql` (seção 2/4)
3. `20260405000003_mcp_servers.sql` (seção 3/4)
4. `20260405000004_rag_hybrid_search.sql` (seção 4/4)
5. `20260405200001_agent_evolution_and_skills.sql` (seção "5/5", `MIGRATION-COLAR:251`)

### Candidatas secundárias (anomalia de nomenclatura)

6. `20260332000001_fix_stub_schemas.sql`
7. `20260332000002_consolidated_schema_fixes.sql`

Ambas têm **timestamp inválido**: `20260332` = 32 de março. São os únicos 2 dos 326 com data impossível. Se qualquer etapa do pipeline (branching/preview do Supabase, ou script próprio) validar o prefixo como data, esses dois seriam rejeitados silenciosamente.

### Candidata para a 8ª

8. `20260805000001_security_bug_corrections.sql` — a migration de maior versão do repo (adicionada 2026-08-05), a mais provável de não ter sido empurrada num último `db push`.

**Alternativa igualmente plausível** para o conjunto inteiro: as 8 últimas por ordem de versão (`20260728174744`, `20260728215658`, `20260728221055`, `20260728222903`, `20260728223443`, `20260728224211`, `20260804000001`, `20260805000001`) — que é o formato mecânico típico de um `db push` que parou. Isso, porém, **contradiz** a evidência de `NEXUS-RELATORIO-TESTES-ABRANGENTE.md:101`, então ranqueio abaixo.

**Como provar em 1 comando** (quem tiver acesso ao banco):

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

e comparar com `ls supabase/migrations | cut -c1-14`.

---

## 4. RLS — o achado central

### 4.1 O repositório TEM as migrations de RLS. Elas são abundantes e explícitas.

- **222 tabelas distintas** recebem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em algum arquivo.
- **384 policies distintas** (par nome+tabela) são criadas, cobrindo **160 tabelas**.
- Existe uma série inteira dedicada, escrita à mão em 2026-07-24, com 13 arquivos: `20260724000001..20260724000013`, incluindo `_rls_credential_vault`, `_rls_automation_workspace_scoped`, `_rls_agent_skills`, `_rls_knowledge_graph`, `_rls_forum_workspace`, `_audit_log_append_only`, `_auth_attempts_hardening`.
- Os cabeçalhos dessas migrations descrevem exatamente as vulnerabilidades que hoje estão abertas em produção. `20260724000002_rls_credential_vault.sql:6-8`:
  > `PROBLEMA: credential_vault policy = FOR ALL USING (auth.uid() IS NOT NULL)`
  > `→ qualquer usuário autenticado lê/escreve TODAS as credenciais`
  > `SOLUÇÃO: adicionar workspace_id + policies workspace-scoped`

**Conclusão: a migration existe. Não é caso de "nunca foi escrita".**

### 4.2 Por que só 39 tabelas têm RLS ligado

Prova por contraexemplo isolado. O arquivo `20260416180547_5555d03a-f522-4dc7-b8d1-dd9e75dd07c8.sql` (gerado pelo Lovable, nome-UUID, portanto do lote "aplicado"):

```
:60  CREATE TABLE IF NOT EXISTS public.user_roles ( ... );
:73  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
:96  CREATE POLICY "Users can view roles in their workspaces" ...
:101 CREATE POLICY "Workspace admins can assign roles" ...
:105 CREATE POLICY "Workspace admins can update roles" ...
:110 CREATE POLICY "Workspace admins can remove roles" ...
```

A linha 73 é **incondicional** — não está dentro de `DO $$`, não tem guarda `IF EXISTS`, não tem `EXCEPTION`. Se esse arquivo tivesse executado contra produção, `user_roles` **teria** RLS ligado e 4 policies. Tem RLS desligado e (dentre as 26 tabelas com policy, pelo total de 58) nenhuma dessas 4.

Isto se replica em escala: 222 declarações → 39 efetivas.

**Só existe um `DISABLE ROW LEVEL SECURITY` em todo o repo** — `20260715173645_ae0a3e97-5a87-4ccd-a208-552748fa162d.sql:11` — e ele é estreitamente escopado: só desliga em partições (`pg_inherits`) que tenham RLS ligado **e nenhuma policy**. Não explica 176 tabelas.

**Portanto: as migrations foram REGISTRADAS como aplicadas sem que o SQL fosse EXECUTADO.**

Isso é consistente com o padrão de `supabase migration repair --status applied` (ou equivalente do Lovable), usado para sincronizar o histórico do CLI com um banco que foi construído por outro caminho. O próprio baseline documenta esse caminho (§5). As duas explicações possíveis:

- **(a) História carimbada, SQL não executado** — explica os 6 desvios simultaneamente (RLS 222→39, triggers 124→2, funções 180→21, policies 384→58, views 21→14, cron 11→0). **Hipótese primária.**
- **(b) Executou e alguém desligou depois via Dashboard** — teria de ter desligado RLS em 183 tabelas, dropado 122 triggers, 159 funções e 326 policies manualmente. Implausível na escala observada.

### 4.3 Bug adicional: mesmo se aplicada, a série de RLS de 2026-07-24 quebraria

`20260724000002_rls_credential_vault.sql:24` faz:

```sql
ALTER TABLE public.credential_vault
    ADD COLUMN workspace_id UUID NOT NULL DEFAULT auth.uid();
```

`auth.uid()` retorna `NULL` fora de um contexto de requisição autenticada. Aplicada via Dashboard/CLI (contexto `postgres`/`service_role`), essa `DDL` falha em tabela não-vazia e, em tabela vazia, condena todo `INSERT` futuro sem JWT. Além disso o `UPDATE` das linhas 37-46 usa `auth.uid()` como filtro — no-op fora de requisição.

E, decisivo: **esse arquivo não contém `ENABLE ROW LEVEL SECURITY`**. Ele cria policies assumindo que `20260405220001_automation_services.sql:166` já ligou o RLS. Como aquela é uma migration escrita à mão (do lote não-aplicado), o resultado seria **policies existentes e inertes** — o pior estado possível, porque passa em auditoria de "tem policy?" sem proteger nada.

---

## 5. Ambiente reconstruível? — **NÃO. Este é o achado mais grave.**

O próprio repositório admite isso, por escrito, na primeira linha da primeira migration.

**`supabase/migrations/20260330000001_schema_baseline.sql:1-11`:**

```
-- Fator X V2 schema baseline — 193 tables applied via Supabase Dashboard
-- 2026-08-01
--
-- IMPORTANT: The full schema was applied interactively via the Dashboard and
-- cannot be fully reconstructed here. The stubs below create the minimum
-- structure needed so that subsequent migration files can reference these
-- tables via FK constraints or ALTER TABLE statements without failing on a
-- fresh (CI/preview) database that starts with no tables at all.
--
-- In production, all IF NOT EXISTS guards prevent conflicts with the real
-- tables created via the Dashboard.
```

### Veredito

**Rodar as 326 migrations do zero NÃO reproduz o banco de produção.** Justificativa em cinco pontos, cada um suficiente sozinho:

1. **193 das 215 tabelas de produção nunca tiveram seu DDL versionado.** Foram criadas manualmente no Dashboard. O que o repo tem no lugar são _stubs_: `agent_traces` com 1 coluna (`:28`), `notifications` com 1 coluna (`:52`), `user_roles` com 1 coluna (`:58`), `agents` com 6 (`:16`). Um banco reconstruído teria as tabelas com os **nomes certos e as colunas erradas** — que é pior que não tê-las, porque falha em runtime, não em migração.

2. **O baseline é retroativo e datado para trás.** Carrega prefixo `20260330` (30 de março) mas o próprio corpo diz `2026-08-01` e o git registra sua introdução em **2026-08-04** (`git log --diff-filter=A`). O mesmo vale para `20260332000001_fix_stub_schemas` e `20260332000002_consolidated_schema_fixes`. A ordem de versão do repo é ficção; não corresponde à ordem em que as coisas aconteceram no banco.

3. **A cadeia `IF NOT EXISTS` inverte o significado das migrations.** Em produção elas são no-ops que preservam o schema do Dashboard; em banco novo elas são a _definição_ — e a definição é o stub. O repositório se comporta de forma diferente nos dois ambientes por construção, não por acidente.

4. **`forensic_snapshots` existe no banco e não é declarada por nenhuma migration.** Drift no sentido inverso: objeto vivo sem origem no repo. Somado às 73 partições geradas em runtime, há estrutura de produção que o repo não conhece.

5. **Nenhum pipeline aplica migrations.** `.github/workflows/ci.yml` não tem `supabase db push`. Não há gate que force repo e banco a convergirem. O drift não é um incidente — é o estado estacionário do sistema.

**Consequência operacional:** não existe caminho de recuperação de desastre a partir deste repositório. Perder o projeto `qdlnzopxrlsoljcrcmzv` significa perder o schema. As 210 tabelas vazias reduzem a perda de _dados_ a quase zero, mas a perda de _estrutura_ é total e irreversível pelo código versionado.

**Agravante — o repositório aponta para dois projetos diferentes:**

- `supabase/config.toml:1` → `project_id = "qdlnzopxrlsoljcrcmzv"`
- `MIGRATION-COLAR-NO-SUPABASE.sql:4` → `-- Projeto: tifbqkyumdxzmxyyoqlu`

O arquivo que a documentação (`NEXUS-RELATORIO-TESTES-ABRANGENTE.md:101`) manda colar no Dashboard traz o ID de **outro** projeto. Se alguém seguiu a instrução, colou no lugar errado — o que explicaria por que aquelas 4-5 migrations continuam sem efeito no projeto correto.

**Agravante — `types.ts` descreve um terceiro schema:** 276 tabelas e 119 funções, contra 215 e 21 medidos. O contrato de tipos que o frontend compila referencia ~61 tabelas e ~98 RPCs que não existem no banco de produção. O TypeScript compila; a chamada retorna 404 em runtime.

---

## 6. GRANTs amplos para `anon` — origem exata

### Resultado da busca: **NÃO EXISTEM no repositório.**

Comandos executados sobre `supabase/migrations/**` + `MIGRATION-COLAR-NO-SUPABASE.sql`:

- `GRANT[^;]*\bTO\b[^;]*anon` → **10 ocorrências, todas estreitas**
- `GRANT +(ALL|.*ON +ALL +TABLES|.*ON +ALL +(FUNCTIONS|SEQUENCES))` → **~60 ocorrências, todas para `service_role`**
- `ALTER +DEFAULT +PRIVILEGES` → **1 ocorrência, e é um REVOKE**

**As 10 concessões a `anon` no repo, na íntegra — nenhuma é de escrita em tabela:**

| Arquivo:linha                                                                    | Statement                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260416203413_6610f520-a7a0-4326-9cde-2fae9d9a5ab1.sql:52` | `GRANT SELECT ON public.forum_threads_public TO anon, authenticated;`                             |
| `supabase/migrations/20260416203413_6610f520-a7a0-4326-9cde-2fae9d9a5ab1.sql:53` | `GRANT SELECT ON public.forum_posts_public TO anon, authenticated;`                               |
| `supabase/migrations/20260416203442_3c81250f-a3be-4c2c-b7d8-bea81b6f46dd.sql:17` | `GRANT SELECT ON public.forum_threads_public TO anon, authenticated;`                             |
| `supabase/migrations/20260416203442_3c81250f-a3be-4c2c-b7d8-bea81b6f46dd.sql:18` | `GRANT SELECT ON public.forum_posts_public TO anon, authenticated;`                               |
| `supabase/migrations/20260418162623_6eb54ed6-a251-4320-ade6-49183e9d45ad.sql:91` | `GRANT SELECT ON public.forum_threads_safe TO authenticated, anon;`                               |
| `supabase/migrations/20260418162623_6eb54ed6-a251-4320-ade6-49183e9d45ad.sql:99` | `GRANT SELECT ON public.forum_posts_safe TO authenticated, anon;`                                 |
| `supabase/migrations/20260410000001_rate_limiter_distributed.sql:134`            | `GRANT EXECUTE ON FUNCTION check_rate_limit TO anon, authenticated, service_role;`                |
| `supabase/migrations/20260522143208_f7b4c2a0-e49e-48da-acd8-eb1b5d001644.sql:44` | `GRANT EXECUTE ON FUNCTION public.is_user_locked_out(text) TO anon, authenticated, service_role;` |
| `supabase/migrations/20260726161137_21809199-94e6-4a51-ad42-1a224926b6db.sql:3`  | `GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;`                          |
| `supabase/migrations/20260418164947_0a3769f3-2b54-4782-9f30-2ca4646a5239.sql:3`  | `GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;`                |

Todas são `SELECT` em view, `EXECUTE` em função, ou `USAGE` em schema. **Zero `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`ALL` para `anon` em qualquer tabela.**

Existem 10 `REVOKE ... FROM anon` no repo (ex.: `20260722103351_04ebb899-...sql:5-19`, `20260417113757_ed8dbab3-...sql:3`), sempre sobre funções ou colunas — a intenção declarada do código é _restringir_ `anon`, não abri-lo.

### Então de onde nasce?

O conjunto medido — `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` para `anon` — é a assinatura do **default privilege do próprio Supabase**. Todo projeto Supabase é provisionado com:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
```

Toda tabela criada em `public` herda isso automaticamente. Como as 193 tabelas foram criadas **manualmente pelo Dashboard** (§5), todas herdaram `GRANT ALL` para `anon` no ato da criação.

**Portanto o achado não tem uma linha de origem no repositório. Sua origem é a ausência de uma linha.** O repositório nunca escreveu o `REVOKE` correspondente, e nunca ligou o RLS que é a _única_ defesa restante nesse modelo.

**O mecanismo completo da falha, em três passos:**

1. Supabase concede `ALL` em `public` a `anon` por default de plataforma (fora do repo).
2. RLS é a única barreira contra isso — e o Supabase por design conta com ela.
3. As migrations que ligariam RLS existem (`20260416180547:73`, `20260405000001:62`, `20260405220001:166`) mas **não executaram** (§4.2).

Resultado: `user_roles`, `credential_vault` e `api_keys` — RBAC, cofre de credenciais e chaves de API — são **legíveis e graváveis com a chave pública `anon`** que está embutida no bundle do frontend. `TRUNCATE` para `anon` em `credential_vault` significa que qualquer visitante pode esvaziar o cofre. Escrita em `user_roles` significa auto-promoção a `workspace_admin`.

**Para confirmar a origem no banco** (não pude executar):

```sql
SELECT defaclrole::regrole, defaclnamespace::regnamespace, defaclacl
FROM pg_default_acl;
```

---

## 7. Onde o RLS deveria ser ligado e não foi — origens exatas

| Tabela                                                                       | Arquivo:linha que ligaria o RLS                                                               | Policies que ficaram ausentes     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| `user_roles`                                                                 | `20260416180547_5555d03a-f522-4dc7-b8d1-dd9e75dd07c8.sql:73`                                  | `:96`, `:101`, `:105`, `:110`     |
| `user_roles` (2ª fonte)                                                      | `20260405000002_rbac_system.sql:76`                                                           | `:90`, `:98`                      |
| `roles`                                                                      | `20260416180547_5555d03a-f522-4dc7-b8d1-dd9e75dd07c8.sql:17`                                  | —                                 |
| `roles` (2ª fonte)                                                           | `20260405000002_rbac_system.sql:73`                                                           | `:80`, `:113`                     |
| `api_keys`                                                                   | `20260405000001_shared_security_infrastructure.sql:62`                                        | —                                 |
| `api_keys` (2ª fonte)                                                        | `20260405153936_2333bf7c-adce-44db-a784-d989833585f9.sql:20`                                  | —                                 |
| `credential_vault`                                                           | `20260405220001_automation_services.sql:166`                                                  | `:167` (policy insegura)          |
| `credential_vault` (correção)                                                | `20260724000002_rls_credential_vault.sql` — **não liga RLS**, só cria policies (`:48`, `:56`) | todas                             |
| `roles`/`user_roles`/`api_keys`/`permissions`/`agent_permissions` (3ª fonte) | `MIGRATION-COLAR-NO-SUPABASE.sql:113-117`, `:42`                                              | —                                 |
| +178 outras tabelas                                                          | 222 declarações distintas de `ENABLE ROW LEVEL SECURITY` espalhadas em ~120 arquivos          | 384 policies declaradas, 58 vivas |

Observação sobre `MIGRATION-COLAR-NO-SUPABASE.sql`: ele **liga** RLS em `roles`, `permissions`, `role_permissions`, `user_roles`, `agent_permissions` (`:113-117`), `api_keys` (`:42`), `rate_limit_logs` (`:23`), `security_events` (`:56`), `mcp_servers` (`:215`), `agent_skills` (`:267`), `skill_registry` (`:287`), `agent_installed_skills` (`:296`) — **mas não cria uma única `CREATE POLICY`**. Ligar RLS sem policy resulta em _negação total_ para `anon`/`authenticated`. Se esse arquivo tivesse sido colado no projeto certo, teria fechado a falha de `anon` (por deny-all) e quebrado o app simultaneamente.

---

## 8. Lista de tabelas fantasma

Declaradas em migrations, ausentes do schema gerado em `types.ts` (2026-07-28). **30 tabelas**, agrupadas pela migration de origem — note que **todas vêm de migrations escritas à mão**, nenhuma de migration gerada pelo Lovable:

**`20260405220001_automation_services.sql`** (7+2):
`credential_vault`¹, `credential_audit_logs`, `connector_registry`, `connector_instances`, `dead_letter_queue`, `batch_jobs`, `execution_history`, `installed_templates`, `automation_templates`

**`20260724000010_lgpd_required_tables.sql`** (6) — pacote LGPD inteiro:
`data_subject_requests`, `data_breach_log`, `data_processing_register`, `data_retention_policies`, `personal_data_inventory`, `lgpd_settings`

**`20260332000002_consolidated_schema_fixes.sql`** (4):
`workflow_executions`, `workflow_handoffs`, `workflow_step_runs`, `mcp_tools`

**`20260724000011_auth_attempts_hardening.sql`** (2):
`account_lockouts`, `ip_rate_limits`

**`20260404210000_huggingface_phase4.sql`** (2):
`hf_config`, `finetune_jobs`

**`20260401200000_implement_all_features.sql`** (2):
`alert_rules`, `prompt_ab_tests`

**Outras** (5):
`agent_permissions` (`20260405000002_rbac_system.sql`), `rate_limit_logs` (`20260405000001_shared_security_infrastructure.sql`), `rate_limit_entries`, `workflow_checkpoints` (`20260405210001_workflow_checkpointing.sql`), `agent_traces_v2`

¹ **Ressalva importante sobre `credential_vault`:** o fato medido em produção diz que ela existe (tem grants de `anon`). Ela está ausente de `types.ts`. Isso significa que `types.ts` **não** foi gerado a partir do banco de produção atual, ou foi gerado antes de a tabela existir. Trate a lista acima como "candidatas fortes", não como prova — a validação exige `\dt` no projeto `qdlnzopxrlsoljcrcmzv`.

**Views fantasma** (4): `_audit_rls_automation`, `_audit_security_definer`, `knowledge_graph_health_v`, `slo_metrics_hourly`

**Drift inverso — existe no banco, não é declarado em lugar nenhum:**

- `forensic_snapshots` — presente em `types.ts`, **zero** `CREATE TABLE` em todo o repo.
- As ~61 tabelas de diferença entre `types.ts` (276) e migrations (236), descontadas as 73 partições geradas em runtime.

**Padrão estrutural que emerge:** existem duas classes de migration neste repo.

- **288 arquivos com nome-UUID** (`<ts>_<uuid>.sql`) — gerados pelo Lovable, que aplica o SQL no banco _e depois_ escreve o arquivo. Os objetos dessas migrations tendem a existir.
- **38 arquivos com nome descritivo** (`<ts>_snake_case.sql`) — escritos por humanos/agentes no git. **Praticamente todos os objetos fantasma vêm daqui.** Sem `db push` no CI, esses arquivos nunca tiveram um caminho até o banco.

---

## 9. O que NÃO cobri

- **Não tive acesso ao banco.** Nada aqui foi verificado contra `pg_catalog`. Todas as afirmações sobre produção derivam dos fatos fornecidos pelo solicitante ou de inferência sobre `types.ts`.
- **Não identifiquei as 8 migrations com certeza.** §2 é hipótese ranqueada, explicitamente marcada como tal. Requer 1 query em `supabase_migrations.schema_migrations`.
- **Não comparei colunas.** A reconciliação é no nível de _objeto_ (tabela/função/view/trigger/policy), não de coluna, tipo, constraint ou default. Tabelas que existem nos dois lados podem ter schemas totalmente diferentes — e o §5 mostra que provavelmente têm.
- **Não auditei os 666 `CREATE INDEX`** contra os índices reais.
- **Não li 314 dos 326 arquivos linha a linha.** Onde o grep resolveu, o grep decidiu. Migrations com SQL dinâmico dentro de `EXECUTE format(...)` podem criar objetos que meu inventário não capturou (as 73 partições são o caso conhecido; pode haver outros).
- **Não avaliei `supabase/functions/`** (edge functions) — fora do escopo desta camada.
- **Não avaliei `docs/architecture/partitioning*.md`** em profundidade além de confirmar que as partições `traces_*`/`spans_*`/`audit_log_v2_*`/`trace_events_v2_*` são geradas por `create_partition_if_not_exists` em runtime e por isso não constam do inventário estático.
- **Extensões:** o repo declara 4 e produção tem 9. Não pude determinar quais 5 são defaults da plataforma (`pgcrypto`, `uuid-ossp`, `pg_graphql`, `pg_stat_statements`, `supabase_vault`, `plpgsql`) nem se `pg_cron`/`pg_net` de fato estão instaladas — o que importa, dado que `cron.job` está vazio apesar de 40 `cron.schedule` declarados.

---

## 10. Ordem de gravidade

1. **`anon` com escrita+TRUNCATE em `credential_vault`, `api_keys` e `user_roles`, sem RLS.** Exploração trivial com a chave pública do frontend. §6.
2. **O ambiente não é reconstruível.** 193 tabelas sem DDL versionado; o repo admite isso em `20260330000001_schema_baseline.sql:1`. §5.
3. **História de migrations carimbada, não executada.** 318 linhas de histórico que não correspondem a SQL rodado: RLS 222→39, triggers 124→2, funções 180→21, policies 384→58. §4.2.
4. **Zero jobs `pg_cron`** apesar de 11 declarados — nenhuma retenção, nenhuma rotina LGPD, nenhuma observabilidade rodando. §1.
5. **`types.ts` descreve um schema que não existe** — ~61 tabelas e ~98 RPCs a mais que produção. Falhas só aparecem em runtime. §5.
6. **Sem gate de CI para migrations.** O drift é o estado estacionário, não um incidente. §2.
7. **Dois project IDs no repo** (`qdlnzopxrlsoljcrcmzv` vs `tifbqkyumdxzmxyyoqlu`). §5.
