# Changelog

## [1.6.0] - 2026-09-05

### Security (Ondas 0–2 da auditoria técnica exaustiva)
- **RLS 100%**: 216/216 tabelas com Row Level Security (eram 39/215) e 760+ policies workspace/user-scoped. Autopromoção de role impossível (`user_roles`: escrita apenas para admin do workspace).
- **Escalação fechada**: REVOKE de INSERT/UPDATE/DELETE/TRUNCATE para `anon` em todas as tabelas (eram 229 objetos com grants, incluindo `user_roles`) + `ALTER DEFAULT PRIVILEGES` para que tabelas novas não nasçam com escrita anon.
- **Rate-limit distribuído materializado**: `rate_limit_entries` + `check_rate_limit()` + `cleanup_rate_limit_entries()` — a migration 20260410000001 estava registrada sem nunca ter executado.
- Helpers de segurança: `get_user_workspace_ids()` e `is_workspace_admin(uuid, uuid)` (overload por workspace, alinhado ao repo).
- 5 migrations órfãs aplicadas e registradas (audit_trigger_fn v2, colunas de agent_versions/agent_usage, drop do overload legado de hybrid_search).
- `pg_cron` reativado: jobs `rate-limit-cleanup-hourly` e `auth-attempts-cleanup-daily`.

### CI/CD
- **Branch protection em `main`**: checks obrigatórios (Security Audit, DB Drift Check, Lint & Typecheck, Unit Tests, Build), enforce admins, histórico linear, force-push bloqueado.
- **Novo job `DB Drift Check`** (`scripts/db-drift-check.mjs`): valida banco×repo (migrations sincronizadas, RLS 100%, zero escrita anon) em todo push/PR — impede que o padrão "migration registrada sem executar" se repita.
- `notify-failure` tolerante à ausência de `SLACK_WEBHOOK_URL` (warning explícito em vez de job vermelho).
- Fix ERESOLVE TipTap: `@tiptap/extension-placeholder` revertido para `^2.27.3` (bump dependabot #49 tinha quebrado `npm ci` em todos os jobs).

### Docs
- Índice de ADRs atualizado (ADR-006 incluído).

## [1.5.0] - 2026-07-22

### Added
- **Grafo Local (a11y):** Nós SVG agora recebem `tabIndex=0`, `role=button`, `focus-visible:ring` e handler `Enter`/`Space` para navegação por teclado.
- **Normalização Unicode:** Novo helper `stripDiacritics` + `foldForSearch` em `src/lib/normalize.ts` (NFD strip).
- **FAB de busca (mobile):** Botão flutuante no `NoteQuickOpen` para dispositivos sem `⌘K`.
- **Simulação v1.5:** 400 novos cenários documentados em `docs/SIMULACAO-SUPER-CEREBRO-V1.5-2026-07-22.md` — score 10/10.

### Fixed
- **Grafo — self-links:** Notas que linkam pra si mesmas não geram mais nó peripheral duplicado.
- **Quick-Open — acentos:** Busca "acao" agora casa "Ação"; "reuniao" casa "Reunião" (fold NFD indexado no `value` do CommandItem).
- **Podcast TTS — resiliência:** Adicionado retry com backoff exponencial (0/800/2000/4500 ms) para respostas 429/5xx do gateway; erros 4xx permanecem definitivos.
- **AI Studio — guard de contexto:** Bloqueia geração de resumo/perguntas em notas com menos de 20 caracteres (evita chamadas caras sem retorno útil).
- **Deep-link — RLS safety:** `?sources=` agora é validado contra `document_ingestions` do notebook ativo; IDs de outros notebooks/workspaces são descartados e logados em `audit_events`.
- **`cerebro-query` — hard cap:** Prompt truncado a 32k chars (~8k tokens) para evitar estouro de contexto em notas gigantes.



All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-07-22

### Added
- **Super Cérebro — Deep-link de fontes**: query string `?sources=uuid1,uuid2` hidrata a seleção de fontes do workspace no mount e sincroniza toda alteração via `replaceState` (sem empilhar histórico). Novo helper `src/lib/sourceIdsSync.ts` com sanitização de UUIDs, dedup e cap de 50.
- **Super Cérebro — Layout mobile**: `NotebookWorkspace` agora usa `Tabs` empilhados (Fontes / Nota / Studio) em telas <768px via `useIsMobile`, mantendo o layout de 3 colunas em desktop.
- **Podcast do Notebook**: nova aba "Podcast" no `StudioPanel` com:
  - Tabela `public.notebook_podcasts` com RLS por membership de workspace, unique index em `(notebook_id, content_hash)` para cache determinístico.
  - Edge function `notebook-podcast-generate` (JWT-guarded, Zod-validated, CORS dinâmico) que gera roteiro PT-BR via Gemini 2.5 Flash e áudio via Lovable AI Gateway (`openai/tts-1`), armazenando em `knowledge-uploads/podcasts/`.
  - Fluxo com estados granulares (`queued`/`generating`/`ready`/`failed`/`canceled`), cancelamento cooperativo entre chunks e reaproveitamento cacheado por SHA-256 de conteúdo+voz.
  - UI `PodcastPanel` com player HTML5, regenerar, cancelar, excluir e signed URLs cacheadas (9min TTL) via `getCachedSignedUrl`.
- **Simulação 300 cenários**: `docs/SIMULACAO-SUPER-CEREBRO-2026-07-22.md` cobrindo Grafo (80), Deep-link (60), Quick-open (40), Studio IA (50), Podcast (40) e regressão RAG (30). Baseline 9.9/10 aprovado.
- **Testes unitários**:
  - `src/test/deep-link-sources.test.ts` — parse/serialize/round-trip de `?sources=`, cap, dedup, case-insensitive.
  - `src/test/local-graph-view.test.tsx` — empty state, in/out, clique navega, cap visual, truncamento de labels.

### Security
- `notebook_podcasts`: policies scoped por `workspace_members` em SELECT/INSERT, e por `created_by = auth.uid()` ou `is_workspace_admin` em UPDATE/DELETE. GRANT explícito para `authenticated` e `service_role`.

## [1.3.0] - 2026-07-22

### Added
- **Slack Onboarding Wizard** (3 passos) substituindo o Alert estático em `/settings/slack`.
- **Slack DLQ Panel** com view `slack_dlq_stats`, botão de reprocessar e descarte admin-only.
- **Edge function `slack-dlq-discard`** com verificação de admin via `is_workspace_admin`.
- **`SlackTestBroadcastButton`** para popular métricas de saúde.
- Documentação: `SIMULACAO-CENARIOS-FASE6.md` (200 cenários) e `FASE6-HARDENING-FINAL.md`.

### Security
- Revogado `EXECUTE` de `authenticated`/`anon` em 14 funções internas SECURITY DEFINER (jobs, triggers, smoke tests).
- `COMMENT ON FUNCTION` documentando as 8 SECURITY DEFINER expostas auditadas.

## [1.2.1] - 2026-07-21

### Added
- **Retrieval híbrido v2 (pgvector)**: novo overload `public.hybrid_memory_search(agent_id, query, query_embedding, limit, tiers)`
  combinando `0.5*cosine + 0.3*text_rank + 0.2*ebbinghaus`. `SECURITY DEFINER` com `REVOKE PUBLIC` + `GRANT` explícito para
  `authenticated` e `service_role`.
- **OpenClaw Templates Gallery — seeds**: 5 novos templates seed (`ecommerce-promo-brindes`, `atendimento-multicanal`,
  `ata-reuniao-automatica`, `opik-observability-bridge`, `curador-conteudo-diario`) cobrindo vendas, atendimento,
  produtividade, observabilidade e conteúdo. Origem: `awesome-openclaw-usecases-zh`.
- **RandomRecallMetricsCard**: nova visualização em `AgentMetricsPage` que consome `audit_events` filtrando
  `event_type = 'random_recall'`. Exibe timeline diária, top-5 agentes e total do período (default 30d).

## [1.2.0] - 2026-07-21

### Added
- **Autograph Memory Layer**: Portabilidade seletiva do motor de memória `autograph/agent-second-brain`.
  - 5 tiers automáticos (`core → active → warm → cold → archive`) com decaimento Ebbinghaus baseado em `access_count` e recência.
  - `computeTier()` client + Edge (`src/lib/memory/tiers.ts`, `supabase/functions/_shared/memory-tiers.ts`).
  - Random Recall (serendipidade) opcional em `oracle-research` via flag `random_recall_enabled` no config do agente.
  - View materializada `knowledge_graph_health` + RPC `get_knowledge_graph_health` (`SECURITY DEFINER`, escopo workspace).
  - Jobs `pg_cron` diários: `recompute_memory_tier` + refresh da MV.
  - UI: `KnowledgeGraphHealthCard` em `AgentMetricsPage`, `MemoryTierBadge` + filtro por tier em `MemoryPage`.
- **Simulação Autograph**: `docs/AUTOGRAPH-SIMULATION-2026-07-21.md` cobrindo 210 cenários em 6 eixos com mitigações.
- **Guia técnico**: `docs/AUTOGRAPH-MEMORY-LAYER.md` documentando tiers, fórmula de decay e random recall.

### Tests
- `src/test/memory-tiers.test.ts`: cobertura dos 5 tiers, pinned e valores inválidos.

## [1.1.0] - 2026-05-22


### Added
- **Security Monitoring Dashboard**: Implementado painel centralizado para alertas de segurança (RLS, RBAC, Auth) com monitoramento em tempo real.
- **Contract Versioning (v1/v2)**: Introduzido versionamento de contratos em Edge Functions com suporte a compatibilidade retroativa.
- **Contract Tests**: Suíte de testes automatizados para validação de payloads e esquemas de API.

### Fixed
- **SECURITY DEFINER Protection**: Corrigido `search_path` em 33 funções do banco de dados para prevenir ataques de interceptação de esquema.
- **Database Linter**: Resolvidos todos os avisos críticos relacionados a políticas RLS e proteção de colunas sensíveis.

## [1.0.1] - 2026-05-13

### Added
- **Auditoria 10/10**: Avanço nas ondas de Quick Wins e Sprint 1.
- **Security**: Implementada validação HMAC obrigatória em webhooks via `_shared/webhookSignature.ts` e integração com `security.ts`.
- **Deno Compliance**: Ajustados logs em Edge Functions para garantir visibilidade no Supabase Dashboard sem violar `no-console`.

### Fixed
- **Type Safety**: Refatorado `billingService.ts` eliminando casts `as any[]` em favor de tipagem automática do Supabase Client.
- **HMAC Enforcement**: Centralizada lógica de verificação de assinatura em `verifyHmac`.

### Changed
- **Logging**: Ativada regra `no-console: error` no ESLint e limpos logs residuais em serviços frontend.
- **Test Infrastructure**: Reforçado threshold de 80% de cobertura no `vitest.config.ts`.

## [1.0.0] - 2026-05-13

### Added
- **Auditoria 10/10**: Iniciada execução do plano de excelência enterprise.
- **Dual-Client Architecture**: Implementado isolamento entre Auth (local) e Data (external) via ADR-006.
- **Partitioning**: Tabelas `audit_log_v2` e `trace_events_v2` agora utilizam particionamento mensal por `created_at`.
- **Cost Calculator**: Centralizada lógica de precificação em Edge Function para garantir precisão e consistência.
- **MFA Enforcement**: Implementada obrigatoriedade de AAL2 para usuários com role 'admin'.
- **Rate Limiting**: Adicionado limitador de taxa para tentativas de login e endpoints críticos.
- **Governança**: Criados guias de `ONBOARDING.md`, `CONTRIBUTING.md` e `DATA-DICTIONARY.md`.

### Fixed
- **HMR Auth Crash**: Corrigido erro `useAuth must be used within AuthProvider` durante recarregamento de módulos.
- **Type Safety**: Iniciada campanha "Zero Any", refatorando serviços críticos para usar tipos estritos do Supabase.
- **Security**: Blindagem de webhooks (WhatsApp/Bitrix) com validação HMAC.

### Changed
- **Logging**: Removidos todos os `console.log` residuais e ativada regra de ESLint `no-console: error`.
- **Test Infrastructure**: Definido threshold de 80% de cobertura obrigatória no CI.

---
*Gerado automaticamente pelo Nexus Agents Studio.*
