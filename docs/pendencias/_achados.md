# Achados técnicos (verificados na sessão 2026-11-20)

## 1. Embedding de chunks preso em failed
- **Onde**: supabase/functions/rag-embed-backfill/index.ts:54-55 lanca 'embedder em modo degradado (hash); nenhum provedor real disponivel' quando nao ha provedor real.
- **Efeito**: chunk 0c9eca8b (doc 97d9c302, ingestao E2E) ficou embedding_status=failed. A edge so processa pending - chunks failed ficam presos para sempre.
- **Gap de negocio**: conhecimento ingerido nunca vira embedding, busca semantica/RAG nao enxerga o documento.
- **Destravamento requer**: LLM key real (DEEPSEEK/OPENAI) no env das edges OU reprocessar failed-pending quando o provedor existir. (Aguardando keys - pendente do dono.)

## 2. RLS orfa em workspace_secrets - NAO e mais problema
- Auditoria 08/2026 alertou: DROP POLICY era no-op (nome real diferente).
- **Verificado no banco hoje**: policies = Owners can view, Admins can insert/update/delete. A orfa ja foi corrigida. RLS 219/219.

## 3. Supabase Preview no CI = MIGRATIONS_FAILED
- Check nao-required em toda PR. Causa provavel: projeto preview aponta para outro/tempo de criacao.
- Nao e piso de merge; monitorar, nao bloquear.

## 4. Projetos Supabase de terceiro em migrations
- fqdohnmgmtaycfwsioik aparece em 3 migrations (slack-alert-dispatcher, whatsapp-router, prova de outro projeto). URLs e anon_key de projeto alheio versionadas. Item Exfil-001/002 no backlog.

## 5. Banco vs auditoria 08/2026 (obsolescencia do doc)
- Auditoria dizia RLS 39/176 e 215 tabelas; hoje: RLS 219/219, 219 tabelas. Muitas tabelas fantasma ja existem. Usar infra viva (pg_class/pg_policies/pg_proc) como verdade, nao o doc.