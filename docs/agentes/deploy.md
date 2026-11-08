# Deploy (Vercel, Lovable e edge functions) — referência para agentes

Ler quando for confirmar um deploy, mexer em env var do front, domínio ou subir edge function.
Resumo no `AGENTS.md`. Tudo abaixo foi medido em 2026-11-08 pelos MCPs de Vercel e GitHub.

## Dois caminhos de publicação

| Caminho                                         | Como                                                                           | Estado medido                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel** — projeto `fator-x-v2`, time `juca1` | Git integration no repo; framework `vite`, Node **24.x**                       | Último deploy de **produção**: `main` em **2026-09-05 18:27 UTC** (commit da PR #54). Último deploy de qualquer tipo: **preview** da branch `fix/security-audit-main-29-10`, 2026-10-29 |
| **Lovable** — `docs/RUNBOOK.md`                 | edição no Lovable Chat → preview → botão **Publish**; rollback por **History** | Caminho documentado como oficial no RUNBOOK; `lovable-tagger` e `@lovable.dev/cloud-auth-js` estão no `package.json`                                                                    |

**Consequência prática:** os merges na `main` de outubro/novembro de 2026 (PRs #56, #57, #60) **não têm deploy
de produção correspondente** na Vercel, e o projeto está com `live: false`. Ou seja: **merge em `main` não
está, hoje, publicando produção pela Vercel.**

**A causa está no lado da Vercel, não no repo:** o deploy do commit `47dee06` (PR #69) voltou com
`state: BLOCKED` — a Vercel nem buildou — e o check `Vercel Agent Review` do mesmo commit diz
"Review skipped because usage billing is not enabled for this team". Enquanto isso não for resolvido no
painel do time `juca1`, o check `Vercel` fica vermelho em **toda** PR (ele **não** é check obrigatório da
`main`, então não bloqueia merge) e nenhum merge publica produção.

Antes de dizer "está no ar", confirme o deploy — `list_deployments` com `target=production` e `state=READY`,
conferindo o `githubCommitSha` — e, se não houver, diga que o merge ficou sem deploy.

Domínios da Vercel: `fator-x-v2.vercel.app`, `fator-x-v2-juca1.vercel.app`,
`fator-x-v2-git-main-juca1.vercel.app`. **SSO protection ligado** (`all_except_custom_domains`): abrir essas
URLs sem sessão Vercel dá tela de login — não confunda isso com app quebrado.

## Edge functions

- **Não sobem no merge.** Não existe workflow de deploy de functions neste repo (`.github/workflows/` tem só
  `ci.yml`, `codeql.yml`, `release-drafter.yml`).
- Caminhos reais: `bash scripts/deploy-edge-functions.sh` (precisa de `SUPABASE_ACCESS_TOKEN`) ou o painel
  Supabase/Lovable Cloud. O RUNBOOK afirma "deployadas automaticamente ao salvar" — isso vale para a edição
  **dentro do Lovable**, não para merge no GitHub.
- ⚠️ `scripts/deploy-edge-functions.sh:8`, `scripts/set-secrets.sh:8` e `scripts/generate-types.sh:8` fazem
  `supabase link` em `tdprnylgyrogbbhgdoik`, que **não é** o projeto oficial (`qdlnzopxrlsoljcrcmzv`). Rodar
  como está publica código e **grava segredos** no projeto errado. Corrija o `PROJECT_ID` (ou passe por
  variável) antes de usar.
- `verify_jwt = false` por função fica em `supabase/config.toml`. Mexer nisso é mudança de segurança: PR
  aberta e chamar o dono.
- Logs: Lovable Cloud → Edge Function Logs, ou painel Supabase do projeto oficial.

## Env vars do front

- `VITE_*` é **público**: entra no bundle em build. Nunca ponha segredo de servidor com prefixo `VITE_`.
- O projeto da Vercel tem **36 entradas** de env (production + preview). Entre elas, duas categorias que
  precisam de decisão do dono (não li nenhum valor, e não se deve ler):
  1. **Segredo de servidor com prefixo `VITE_`** — `VITE_RESEND_API_KEY`, `VITE_TWILIO_AUTH_TOKEN`,
     `VITE_LANGFUSE_SECRET_KEY`, `VITE_GOOGLE_MAPS_API_KEY`: se tiverem valor real, estão **no bundle**, logo
     públicos → rotacionar e mover para edge function/secret.
  2. **Segredo de servidor sem prefixo** — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HUGGINGFACE_API_KEY`,
     `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `BITRIX24_WEBHOOK_TOKEN`, `TWILIO_AUTH_TOKEN`,
     `WHATSAPP_ZAPI_TOKEN`, `WHATSAPP_EVOLUTION_TOKEN`: num SPA estático **não são usados em runtime** (só
     existiriam no build), então estão guardados no lugar errado. O lugar deles é `supabase secrets set`.
- As variáveis que o app realmente lê estão em `.env.example` (4 de Supabase + Sentry/Langfuse/OTel/app).
  Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` o client cai em placeholder e
  `isSupabaseConfigured` fica `false` (`src/integrations/supabase/client.ts:5-10`).

## Checklist ao reportar deploy

1. PR mergeada (squash) e branch apagada.
2. `Build` verde no CI **não é deploy** — é só build de validação.
3. Deploy de produção: `list_deployments` (`target=production`, `state=READY`) com `githubCommitSha` igual ao
   commit do merge. Sem isso → "mergeado, sem deploy confirmado".
4. Comportamento verificado (request, log ou query real), não "deveria funcionar".
