# Linha de Base — Estado verificado em 2026-11-20 (base main `3a23906d`)

> "Pronto" = integrado ponta a ponta + deploy + evidência. Este inventário é a régua anti-regressão: qualquer feature nova deve manter 100% disto funcionando.

## Build / CI / Qualidade
| Item | Estado | Evidência |
|---|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ 0 erros | sessão 2026-11-20 |
| `npm run lint` | ✅ 0 erros (1 warning herdado: `bitrix24-webhook/index.ts:37` `verifyHmac` sem uso) | sessão 2026-11-20 |
| `npm test` | ✅ 200 arquivos / 6231 testes passando | sessão 2026-11-20 |
| CI (Security Audit, Lint, Unit Tests, Build, DB Drift, E2E, Edge Contracts) | ✅ verde na `main` | PR #128 |
| Supabase Preview | ⚠️ MIGRATIONS_FAILED (não-required) | investigar |

## Banco de produção (`qdlnzopxrlsoljcrcmzv`, PostgreSQL 17.6)
| Item | Estado | Evidência |
|---|---|---|
| Migrations aplicadas | ✅ 334/334 (0 drift) | `supabase_migrations.schema_migrations` |
| Tabelas `public` | ✅ 219 | pg_class |
| RLS ligado | ✅ 219/219 tabelas (100%) | pg_class.relrowsecurity |
| Policies `workspace_secrets` | ✅ Owners can view / Admins can insert-update-delete | pg_policies |
| RPCs `public` | ✅ 41 (`exec_sql`, `hybrid_memory_search`, `match_documents`, `log_audit_entry`, ...) | pg_proc |

## Edge functions (produção)
| Item | Estado | Evidência |
|---|---|---|
| `doc-parse` (PDF→chunks) | ✅ HTTP 200 `{"status":"ok","deduped":true}` com JWT real após fix jsonResponse | E2E 2026-11-20 |
| `doc-rechunk`, `rag-ingest`, `workflow-engine-v2` | ✅ fix 500 (`jsonResponse(req,` em 22 chamadas) mergeado e deployado (#128) | run 44799932324 success |
| Embedding de chunks | ⚠️ `rag-embed-backfill` marca `failed` (embedder degradado sem provedor real); só processa `pending` | chunk `0c9eca8b` → failed |

## Funcionalidades núcleo (código existe e está ligado — 141 pages, 146 services, 88 edges, 368 components, 334 migrations)
- **RAG/knowledge**: bucket `knowledge-uploads` criado (#127), RLS policies, ingestão E2E ok no fluxo de storage.
- **Chat/anexos**: ChatComposer com anexos no AgentTalk (#126) — schema reconciliado.
- **Menu ↔ rotas**: 110/110 itens do menu lateral têm rota (`07-componentes-b.md:118`); 151 paths em `App.tsx`.
- **RBAC**: `user_roles`, RPCs `user_has_permission`/`is_workspace_admin`/`has_role`, componente AccessControl.
- **Auditoria**: `audit_log` append-only + `log_audit_entry` RPC-only.
- **GRC (RiskRegister, GameDayLive, SyntheticMonitoring, Asset/Vendor/BCP summaries)**: services e páginas existem; gaps de RPC/escrita listados em `_ordem.md`.

## Segurança que NÃO regredir
- Nenhum segredo em repo; `key_value` não pode voltar (RN-4).
- RLS 219/219 é o piso — migration nova não pode desligar RLS de tabela existente.
- `api_keys`/`credential_vault`/`workspace_secrets` continuam restritas (RN-2/RN-3).
- Notificações e webhooks de terceiros nunca devem voltar a apontar para `fqdohnmgmtaycfwsioik` (RN-9).

## Relíquias verificadas (NÃO apagar sem revisão, mas sem conteúdo útil)
- `origin/master`: 0 diff vs main (snapshot antigo).
- `origin/contexto`: 0 diff vs main (regen automática de fontes `[skip ci]`).
- Ambas **não** contêm trabalho não incorporado — seguro descartar, mas é deleção: requer palavra final do dono.
