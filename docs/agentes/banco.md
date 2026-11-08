# Banco de dados — referência para agentes

Ler quando for rodar SQL, criar/aplicar migration, montar Postgres local, mexer em RLS ou conferir drift.
Resumo das regras no `AGENTS.md`; aqui está o detalhe. Errar o banco aqui já custou retrabalho real — este
repo tem histórico de migration registrada sem ter sido executada e de três project IDs circulando no código.

## Onde se trabalha

| Situação                                         | Banco                             | Como                                                                      |
| ------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| Diagnóstico                                      | **produção, só leitura**          | `SELECT` por MCP do projeto oficial; nunca escrita para "testar"          |
| Migration nova                                   | arquivo em `supabase/migrations/` | PR → merge → apply no projeto oficial → `node scripts/db-drift-check.mjs` |
| Teste de comportamento de banco                  | **Postgres descartável**          | nunca no projeto oficial                                                  |
| Migration destrutiva, segredos, rotação de chave | **só com o dono**                 | —                                                                         |

## Projeto OFICIAL

`qdlnzopxrlsoljcrcmzv` — `supabase/config.toml:1`, `.env.example:10-12`.

**Atenção ao MCP que carregou.** Em sessões de nuvem costumam estar disponíveis MCPs de Supabase de **outros**
sistemas. Verifique com `get_project_url` antes de qualquer `execute_sql`:

| MCP                             | Projeto                | Papel aqui                                     |
| ------------------------------- | ---------------------- | ---------------------------------------------- |
| `SUPABASE - GESTÃO DE CLIENTES` | `pgxfvjmuubtbowutlide` | CRM de outro sistema — **só leitura**          |
| `SUPABASE - GESTÃO DE PRODUTOS` | `doufsxqlfjyuvxuezpln` | Catálogo de outro sistema — **só leitura**     |
| `SUPABASE - ZAPP WEB V2 - MCP`  | `tnnnlkbymytvtqngbbqh` | outro produto (Zapp Web V2) — **não escrever** |

Se nenhum MCP aponta para `qdlnzopxrlsoljcrcmzv`, **diga que não consegue ler o banco** e pare; não infira
estado de produção a partir de migration ou documento.

### IDs de outros projetos ainda dentro do código

| ID                     | Onde                                                                                                                                                                                            | O que é                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `tdprnylgyrogbbhgdoik` | `src/config/env.ts:28` (default de `VITE_SUPABASE_PROJECT_ID`), `index.html:17` (dns-prefetch), `scripts/deploy-edge-functions.sh:8`, `scripts/set-secrets.sh:8`, `scripts/generate-types.sh:8` | "banco externo" da arquitetura dual; os 3 scripts fazem `supabase link` **neste** ID |
| `fqdohnmgmtaycfwsioik` | `supabase/migrations/20260721155600_*.sql:65`, `20260722112903_*.sql:132`, `20260722115149_*.sql:4`, `src/pages/WidgetBuilderPage.tsx:41`                                                       | destino errado de alertas de segurança e WhatsApp em triggers                        |

Antes de rodar qualquer um desses scripts, **confira o `PROJECT_ID` no topo do arquivo**: rodar
`deploy-edge-functions.sh` ou `set-secrets.sh` como estão publica código e segredos em outro projeto.

## Arquitetura de dois clients (ADR 006)

- `src/integrations/supabase/client.ts` — **só auth** (`VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`);
  sem as duas variáveis cai em `https://placeholder.supabase.co` e `isSupabaseConfigured` fica `false`.
- `src/integrations/supabase/externalClient.ts` — **todos os `from()` e RPC de dados**. URL/chave vêm de
  `VITE_EXTERNAL_SUPABASE_URL` / `VITE_EXTERNAL_SUPABASE_ANON_KEY`; faltando, cai no client de auth
  (`VITE_SUPABASE_*`) e só avisa em DEV (`externalClient.ts:29-33`). ~142 arquivos de `src/` dependem dele.
- RLS no client externo depende de `syncExternalAuth(session.access_token)` no `AuthContext` — mexer em auth
  sem isso derruba a autorização de todo o caminho de dados.

Consequência prática: **o mesmo código aponta para 1 ou 2 bancos dependendo do `.env`.** Antes de testar tela,
confira as 4 variáveis; sem elas o dev server fala com o projeto que estiver em `VITE_SUPABASE_URL`.

## Regras de migration

1. Migration é arquivo em `supabase/migrations/` (329 hoje), nunca SQL colado à mão no painel.
2. **Registrada ≠ aplicada.** A auditoria mediu migrations gravadas em `supabase_migrations.schema_migrations`
   cujo SQL nunca executou (`ESTADO-ATUAL.md` §3.1-3.2). Depois de aplicar, **meça**: a tabela/policy/função
   existe? Sem `SELECT` de confirmação, não diga que aplicou.
3. O guard é `node scripts/db-drift-check.mjs` (job `DB Drift Check` no CI, obrigatório na `main`). Valida três
   invariantes: migrations repo = banco, RLS em 100% das tabelas `public`, zero grant de escrita para `anon`.
   Sem a secret `DB_MCP_URL` ele sai `0` com warning — **CI verde aqui não prova banco em dia**.
4. Nada de `GRANT ... TO anon` de escrita. O default privilege da plataforma Supabase já dá `SELECT` a `anon`
   em tabela nova criada pelo Dashboard: RLS é a única defesa nesse modelo.
5. Migration que cria trigger com `net.http_post` precisa apontar para `qdlnzopxrlsoljcrcmzv` (ver a tabela de
   IDs acima) e não embutir JWT no SQL.
6. `pg_cron`/`pg_net`: 11 jobs declarados em migrations, **0 ativos** quando a auditoria mediu. Se o fluxo
   depende de cron, confirme o agendamento no banco antes de dizer que funciona.
7. Migration destrutiva (`DROP`, `TRUNCATE`, `ALTER ... DROP COLUMN`), rotação de chave e mudança de grant:
   só com o dono, em PR separada, com plano de volta.

## Riscos de segurança abertos no banco (medidos em 2026-08, `ESTADO-ATUAL.md` §4)

Leia antes de prometer qualquer hardening — e não "aproveite para corrigir" sem pedido:

- `public.exec_sql(query text)` em produção, `SECURITY DEFINER`, com `EXECUTE` para `anon`: SQL arbitrário
  ignorando RLS. **Não nasce de migration nenhuma** do repo (0 ocorrências) — veio de bootstrap externo.
- `user_roles` (e `credential_vault`, `api_keys`, `roles`, `workspace_members`) sem RLS e com escrita para
  `anon` → escalação a `workspace_admin`, que `useRBAC` trata como "pode tudo".
- 176 de 215 tabelas sem RLS, legíveis por `anon`. Hoje o impacto é baixo porque estão vazias.
- 5 tabelas com policy escrita e **RLS desligado** (policy inerte).
- `rag-embed-backfill` com `verify_jwt = false` (`supabase/config.toml`) usando `SERVICE_ROLE_KEY` sem checar
  identidade; outras 16 functions usam `SERVICE_ROLE_KEY` confiando só no `verify_jwt` da plataforma.
- Protegido de verdade: `workspace_secrets` (RLS ligado, 4 policies por dono do workspace).
