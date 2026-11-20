# Regras de Negócio — Nexus Agents Studio (Fator_X_V2)

> Compiladas da auditoria de 2026-08-16 e verificação na `main` (base `3a23906d`) + banco prod (334/334 migrations aplicadas). Este arquivo é a régua para qualquer conserto: mudança que viole regra aqui = regressão.

## 1. Multi-tenancy e isolamento
- **RN-1** Toda tabela com coluna `workspace_id`/`user_id` pertence a um tenant; escrita/leitura fora do tenant é proibida (RLS obrigatório — banco em produção tem RLS em 219/219 tabelas).
- **RN-2** `workspace_secrets` só é legível por owner/admin do workspace. Policies atuais: `Owners can view`, `Admins can insert/update/delete` (verificado no banco).
- **RN-3** `credential_vault` e `api_keys` têm RLS ligado; credenciais de provedor **nunca** saem para o browser (só via edge function server-side).

## 2. Segredos e credenciais
- **RN-4** Segredos de terceiros vivem em env vars de deploy (`HF_API_TOKEN`, `OPENAI_API_KEY`, `LOVABLE_API_KEY`, `OPENCLAW_WEBHOOK_SECRET`, ...) ou em `workspace_secrets.encrypted_value` — **`key_value` não existe mais** (removido na migration `20260405225419`) e **não deve ser recriado**.
- **RN-5** Não existe camada de descriptografia server-side de `encrypted_value`; qualquer integração que precisar ler um secret do banco precisa dessa camada **antes**.
- **RN-6** Nenhum segredo em código/migration/repo — só env/secret de serviço.

## 3. Integrações
- **RN-7** Webhooks de provedores externos (Bitrix24, OpenClaw, WhatsApp, Slack) **não emitem JWT Supabase** → a edge correspondente precisa de `verify_jwt = false` no `config.toml`.
- **RN-8** Chamadas a APIs de terceiros acontecem **server-side** (edge function), nunca no browser.
- **RN-9** O projeto Supabase de produção é `qdlnzopxrlsoljcrcmzv` (`supabase/config.toml:1`). Nenhuma migration pode apontar para outro projeto (`fqdohnmgmtaycfwsioik` é PROIBIDO — era exfiltração).

## 4. Edge functions (contratos)
- **RN-10** `_shared/cors.ts` exige `jsonResponse(req, data, status?)` e `getCorsHeaders(req)` — `req` é obrigatório (usar `req.headers.get('Origin')` sem `req` = TypeError → 500).
- **RN-11** Toda edge de negócio deve validar payload com Zod e responder CORS.

## 5. Dados / RAG
- **RN-12** Chunks moram em `public.chunks` (não `document_chunks`/`doc_chunks`); `embedding_status` ∈ {pending, failed, indexed}; `rag-embed-backfill` só processa `pending`.
- **RN-13** `agent_memories_v2` é a memória de longo prazo; consulta híbrida via RPC `hybrid_memory_search`/`memory_relevance`.
- **RN-14** Docs/PDFs são ingeridos via edge `doc-parse` (storage bucket `knowledge-uploads`); `storage_path` é relativo ao bucket (sem prefixo `knowledge-uploads/`).

## 6. Automação / workflows
- **RN-15** `automation:test` roda suítes com `testSuites` (não `legacy/manual`) para ligar aos gatilhos do CI.
- **RN-16** Workflows e jobs de automação gravam estado em tabelas do schema (ex.: `automation_blocks`, `workflow_executions`) — não em memória.

## 7. Auditoria e compliance
- **RN-17** `audit_log` é append-only, escrita por RPC `log_audit_entry`; nada apaga.
- **RN-18** Notificação não pode reportar `success: true` sem entrega real (o `notification-sender` hoje mente — ver `docs/pendencias/`).
- **RN-19** LGPD: DSR/export/deleção exigem dados de `data_subject_requests` etc. — o pacote LGPD precisa existir de fato no banco antes de qualquer claim de conformidade.

## 8. Deploy / CI
- **RN-20** Merge em `main` dispara deploy automático (edges Vercel/Supabase). CI requer: Security Audit, Lint & Typecheck, Unit Tests, Build, DB Drift, E2E Tests, Edge Function Contract Tests.
- **RN-21** `edge-deploy.yml` deve rodar limpo (sem warnings) para as 4 edges críticas (`doc-parse`, `doc-rechunk`, `rag-ingest`, `workflow-engine-v2`).
- **RN-22** Branch `master` e `contexto` são relíquias (0 diff vs main, verificados em 2026-11-20) — não são fonte de verdade.
