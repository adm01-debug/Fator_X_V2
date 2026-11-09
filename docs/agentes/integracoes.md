# Integrações com terceiros — referência para agentes

Ler quando mexer em Slack, Bitrix24, WhatsApp/OpenClaw, LLM gateway, HuggingFace, MCP ou A2A.
Resumo no `AGENTS.md`. Fonte medida: `docs/auditoria-estado-2026-08/09-integracoes.md` (32 integrações) —
leia-o antes de prometer qualquer uma delas.

## Regra de ouro deste arquivo

**Nenhuma integração deste repositório processou registro em produção** (tabelas vazias, zero cron ativo).
Classificação medida: 3 TOTAL (HuggingFace, Lovable AI Gateway, Sentry — e "total" só por construção de
código), 17 PARCIAL, 6 SUGERIDO, 6 MORTO. Antes de dizer "integrado", siga o fio até um request real.

## O defeito que corta 5 integrações de uma vez

`supabase/migrations/20260405225419_*.sql:82` executa
`ALTER TABLE public.workspace_secrets DROP COLUMN IF EXISTS key_value;` — o banco vivo só tem
`encrypted_value bytea` (`src/integrations/supabase/types.ts:13673`). Cinco pontos de código ainda
leem/escrevem `key_value` (coluna inexistente); um sexto (`whatsappOutboundService`) já usa a coluna certa
mas falha de outro jeito (lê o `bytea` encriptado sem decriptar):

| Arquivo:linha                                                                 | Consequência                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/bitrix24-oauth/index.ts:74,78`                            | callback OAuth falha → token nunca é gravado                                                                        |
| `supabase/functions/bitrix24-api/index.ts:19`                                 | erro 42703 → "Bitrix24 não conectado"                                                                               |
| `supabase/functions/crm-bitrix-sync/index.ts:75,79`                           | sync nunca roda                                                                                                     |
| `supabase/functions/bitrix24-webhook/index.ts:116`                            | workspace nunca resolve → `no_route`                                                                                |
| `supabase/functions/llm-gateway/index.ts:516,520,522,547,551,553,568,572,576` | BYO-key de OpenAI/Anthropic/Google/OpenRouter **sempre vazia**                                                      |
| `src/services/whatsappOutboundService.ts:70,77`                               | lê `encrypted_value` (coluna real, `bytea` pgp-encriptado) direto como string, sem decriptar — nunca lê `key_value` |

**Efeito no `llm-gateway`:** a cadeia de fallback só monta 2 opções, as duas por env (`HF_API_TOKEN`,
`LOVABLE_API_KEY`) → **Lovable AI Gateway é o único provedor LLM realmente ligado hoje**. Mexer em provedor de
LLM sem corrigir isso é trabalho perdido.

## Por integração — o que checar antes de tocar

- **Slack** (7 edges, HMAC v0 real, dedupe, DLQ, circuit breaker, 7 componentes de UI): o fio mais completo.
  Quebra em (a) trigger de `security_alerts` apostando no projeto Supabase errado
  (`supabase/migrations/20260722112903_*.sql:132`), (b) **zero cron agendado** (DLQ/cleanup/RAG sync existem só
  no doc), (c) cron de DLQ lê `current_setting('app.settings.service_role_key')` — GUC provavelmente não setada,
  (d) `slack-agent-notify` sem nenhum chamador. Secrets: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, sem fallback.
- **Bitrix24**: código completo, morto na prática pelo `key_value` acima. Conserto é mecânico.
- **WhatsApp**: 3 caminhos. `whatsapp-router` (via OpenClaw) é o único com `verify_jwt=false` correto, mas o
  trigger de autoreply posta no projeto errado (`20260721155600_*.sql:65`) e engole o erro com
  `EXCEPTION WHEN OTHERS THEN RETURN NEW` — nada aparece em log. Envio direto do navegador com credencial de
  provedor está classificado como MORTO: não reanime sem decisão do dono.
- **HuggingFace / Lovable AI Gateway / Sentry**: os três ligados por env. Mudança aqui afeta custo → avise.
- **MCP**: `datahub-mcp-server` é servidor próprio (edge). O `agent.json` da raiz aponta 3 MCPs em
  `*.workers.dev` (Bitrix24, n8n, chrome) que são SUGERIDO — não trate como infraestrutura do produto.
  `MCPServerManager` (registro de servidores externos) está MORTO.
- **A2A** (`supabase/functions/a2a-server`), **browser-agent-run**, **voz (TTS/STT)**, **OCR**: PARCIAIS.
- **OpenClaw** (gateway self-hosted, pasta `openclaw/`): precisa de instância no ar (`OPENCLAW_URL`,
  `OPENCLAW_API_TOKEN`); `scripts/openclaw-remediation.sh` e `openclaw/docs/` têm o plano de instalação.
- **E-mail e Pagamentos**: SUGERIDO. `sendEmail()` retorna sucesso sem entregar — não use como prova de nada.
- **Guardrails** (`supabase/functions/guardrails-engine`): 4 camadas (`input → dialog → output → runtime`) com
  4 rails (prompt injection, PII, toxicidade, vazamento de segredo). Falham **em aberto e em silêncio** —
  não conte com eles como controle de segurança.

## Segredos das integrações

- Edge: `npx supabase secrets set` (ou painel). Nunca em migration, nunca em `src/`, nunca no chat.
- O repo já teve JWT anônimo de terceiro projeto hardcoded em migration (`09-integracoes.md` §4) — se você
  encontrar chave em SQL, reporte ao dono em vez de "só corrigir".
- `supabase/config.toml` tem 13 linhas para ~90 functions: a maioria roda com o default de `verify_jwt`.
  Trocar esse flag é mudança de segurança → PR aberta + dono.
