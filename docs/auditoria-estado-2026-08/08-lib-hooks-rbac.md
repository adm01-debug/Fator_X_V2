# Auditoria de Estado — Lote `src/lib` + Estado Compartilhado

**Escopo:** `src/lib/` (92 arq / 15.218 linhas), `src/hooks/` (44 / 4.331), `src/stores/` (12 / 1.682), `src/config/` (10 / 1.241), `src/contexts/` (1 / 154), `src/data/` (5 / 2.613), `src/i18n/` (2 / 876), `src/types/` (4 / 526). **Total real medido: 26.641 linhas.**
**Excluído:** `src/integrations/supabase/types.ts` (gerado).
**Método:** leitura de arquivo + contagem de importadores por módulo + consultas SQL ao banco real (`qdlnzopxrlsoljcrcmzv`, 215 tabelas — confirma o fato do auditor-mor).
**Data:** 2026-08-16. HEAD `096ccebd`.

---

## 0. Descoberta que muda a leitura de tudo

O código opera em arquitetura **dual-client** (`src/lib/supabaseExtended.ts:9-17`): `supabase` = só auth; `supabaseExternal` = todos os dados, apontando para um banco "externo" documentado como `tdprnylgyrogbbhgdoik` (`src/integrations/supabase/externalClient.ts:4`, `src/config/env.ts:28`).

**Esse banco externo não existe mais.** O `.env.example` (linhas 9-19) aponta as DUAS variáveis para o MESMO projeto `qdlnzopxrlsoljcrcmzv` — o banco de 215 tabelas com 5 povoadas. O comentário e o fallback hardcoded `tdprnylgyrogbbhgdoik` são resíduo de uma migração. Logo: **toda query de dados do app cai no banco vazio.**

---

## 1. Tabela de classificação

| Funcionalidade/Módulo                                       | Classificação                                         | Evidência (arquivo:linha)                                                                                                                     | Observação                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RBAC — enforcement de permissões**                        | MORTO_OU_ABANDONADO                                   | `src/services/rbacService.ts:47-57` (37 chaves) vs. `permissions` = **0 linhas**, `role_permissions` = **0 linhas** no banco                  | `getUserPermissions()` sempre devolve `Set` vazio. Nenhuma permissão jamais concede nada.                                                                                                                |
| **RBAC — bypass de admin**                                  | IMPLEMENTADO_TOTAL (e é o único caminho que funciona) | `src/hooks/useRBAC.ts:102-103` `if (state.role === 'workspace_admin') return true;`                                                           | Único mecanismo que libera UI. Todo não-admin vê a app inteira bloqueada.                                                                                                                                |
| **RBAC — hierarquia de roles**                              | IMPLEMENTADO_PARCIAL / inconsistente                  | `src/hooks/useRBAC.ts:114-120` (5 níveis) vs. `src/services/rbacService.ts:59` (5 chaves) vs. tabela `roles` = 3 linhas com chaves DIFERENTES | Ver Veredito RBAC.                                                                                                                                                                                       |
| **RBAC — escalação de privilégio via `anon`**               | FALHA CRÍTICA                                         | `user_roles`: `relrowsecurity=false`, 0 policies, grants `INSERT/UPDATE/DELETE` para `anon`                                                   | Qualquer navegador com a anon key insere `role_key='workspace_admin'` e vira admin. Combinado com `useRBAC.ts:103` = acesso total.                                                                       |
| **ADR-005 `get_user_workspace_ids()` SECURITY DEFINER**     | MORTO_OU_ABANDONADO                                   | `docs/adr/005-rbac-client-side.md:14` afirma existir; `pg_proc` **não tem essa função**                                                       | O mecanismo anti-recursão descrito no ADR nunca foi criado. Só existem `is_workspace_admin(uuid)` e `apply_workspace_rls(text)`.                                                                         |
| **`AccessControl` / `ProtectedRoute`**                      | IMPLEMENTADO_TOTAL (código) / inútil (efeito)         | `src/components/rbac/AccessControl.tsx:41-55`, `ProtectedRoute.tsx:42,63`                                                                     | Código correto. Como `permissions` é sempre vazio, o gate é binário: admin vê tudo, resto vê nada.                                                                                                       |
| **Autenticação (email/senha, reset, update)**               | IMPLEMENTADO_TOTAL                                    | `src/contexts/AuthContext.tsx:57-124`                                                                                                         | Supabase Auth padrão. Funciona.                                                                                                                                                                          |
| **Lockout por tentativas falhas**                           | IMPLEMENTADO_TOTAL                                    | `AuthContext.tsx:70-79` → RPC `is_user_locked_out` **existe** no banco                                                                        | Único RPC de segurança que realmente existe.                                                                                                                                                             |
| **Log de tentativas de login**                              | IMPLEMENTADO_PARCIAL                                  | `AuthContext.tsx:83-90` insere em `auth_attempts`                                                                                             | Tabela tem RLS **desligada** + grants totais p/ `anon`: qualquer um lê e apaga o log. `ip_address: null` sempre — o campo nunca é preenchido.                                                            |
| **MFA/AAL2 obrigatório para admin**                         | SUGERIDO_OU_INICIADO                                  | `AuthContext.tsx:94-103`                                                                                                                      | Detecta que falta AAL2 e apenas chama `logger.warn`. **Não bloqueia, não redireciona.** Comentário admite: "This is a prompt/flag for the UI". Nenhuma UI consome esse flag.                             |
| **2FA TOTP (`otpauth`)**                                    | MORTO_OU_ABANDONADO                                   | `src/hooks/use2FA.ts` inteiro                                                                                                                 | Ver Veredito 2FA.                                                                                                                                                                                        |
| **2FA — backup codes**                                      | FALHA CRÍTICA                                         | `src/hooks/use2FA.ts:48` `Math.random().toString(36)`                                                                                         | Códigos de recuperação gerados com PRNG não-criptográfico.                                                                                                                                               |
| **2FA — segredo TOTP**                                      | FALHA CRÍTICA                                         | `src/hooks/use2FA.ts:50-52` grava `secret` em claro                                                                                           | Segredo TOTP persistido sem cifra.                                                                                                                                                                       |
| **Trilha de auditoria (`logAudit`)**                        | MORTO_OU_ABANDONADO                                   | `src/lib/auditService.ts:36` chama RPC `log_audit_entry` — **função não existe** no banco                                                     | Todo `logAudit()` cai no `catch` e emite `logger.warn` (linha 44). Zero eventos gravados. 20 tipos de ação declarados (linhas 7-17), nenhum funciona.                                                    |
| **i18n — infraestrutura**                                   | IMPLEMENTADO_TOTAL                                    | `src/i18n/I18nProvider.tsx:37-79`, montado em `src/App.tsx:224`                                                                               | Provider, `localStorage`, interpolação `{var}`, fallback de locale: tudo correto.                                                                                                                        |
| **i18n — cobertura de uso**                                 | SUGERIDO_OU_INICIADO                                  | 332 chaves × 2 locales; **1 página** usa `t()` (`src/pages/RoutingConfigPage.tsx:39`)                                                         | 23 chaves únicas em uso de 332. ~93% do dicionário é código morto.                                                                                                                                       |
| **`src/data/agentTemplates.ts`**                            | IMPLEMENTADO_TOTAL (como dado fixo)                   | `src/data/agentTemplates.ts:736` — 41 templates                                                                                               | Alimenta `AgentTemplatesPage`, `CreateAgentWizard`. Prompts com "Promo Brindes" hardcoded (linhas 59,73,87,101,115,129,143,171,185,213,241,276,306,320,348,362,378,394).                                 |
| **`src/data/agentBuilderData.ts`**                          | IMPLEMENTADO_TOTAL                                    | `:3` TABS (20 abas), `:25` DEFAULT_AGENT, `:103` LIFECYCLE_STAGES                                                                             | 9 importadores reais. É config de UI legítima, não mock.                                                                                                                                                 |
| **`src/data/quickAgentTemplates.ts`**                       | IMPLEMENTADO_TOTAL                                    | `:560` QUICK_AGENT_TEMPLATES (7 tipos), `:681` QUICK_AGENT_MOCK_INPUTS                                                                        | 14 importadores. `QUICK_AGENT_MOCK_INPUTS` é dado fictício **por design** (exemplos de teste no wizard) — honesto no nome.                                                                               |
| **`src/data/guardrailPresets.ts`**                          | IMPLEMENTADO_TOTAL                                    | `:22` GUARDRAIL_PRESETS (14 presets)                                                                                                          | 1 importador: `GuardrailsLibrary.tsx:11`. Catálogo estático de presets — legítimo.                                                                                                                       |
| **`src/data/curatedSkills.ts`**                             | MORTO_OU_ABANDONADO                                   | `src/data/curatedSkills.ts:31` — 72 skills, 789 linhas                                                                                        | **Zero consumidores em produção.** Só 3 arquivos de teste. Docstring (linhas 9-11) afirma "semeadas em `skill_registry`" — não existe nenhum código de seed no repo e `skill_registry` tem **0 linhas**. |
| **Seed de `skill_registry`**                                | MORTO_OU_ABANDONADO                                   | grep `CURATED_SKILLS` em todo o repo → só `src/data/` + 3 testes                                                                              | O contrato prometido pela docstring não foi implementado.                                                                                                                                                |
| **`src/config/env.ts` — validação de env**                  | MORTO_OU_ABANDONADO                                   | `src/config/env.ts:41` `export const env = validateEnv()` — **0 importadores**                                                                | "Fails fast with clear error messages" que nunca roda. Sem ele, `client.ts:5-6` cai em `https://placeholder.supabase.co` silenciosamente.                                                                |
| **`src/config/huggingface.ts` + `huggingface-models.ts`**   | MORTO_OU_ABANDONADO                                   | 0 importadores (156 linhas somadas)                                                                                                           | Config de "26 integrações HF" e catálogo de preços de modelos, sem nenhum consumidor.                                                                                                                    |
| **`src/config/auto-facts.ts`**                              | MORTO_OU_ABANDONADO                                   | 0 importadores (64 linhas)                                                                                                                    | 19 "fatos institucionais" para o Super Cérebro; nada lê.                                                                                                                                                 |
| **`src/types/hfTypes.ts`**                                  | MORTO_OU_ABANDONADO                                   | 0 importadores (78 linhas)                                                                                                                    | Tipos do HuggingFace órfãos, par do config acima.                                                                                                                                                        |
| **`src/config/skill-departments.ts`**                       | IMPLEMENTADO_TOTAL                                    | 19 importadores; paridade com Edge Function testada                                                                                           | Módulo saudável.                                                                                                                                                                                         |
| **`src/config/datahub-entities.ts` / `datahub-columns.ts`** | IMPLEMENTADO_TOTAL                                    | 9 e 6 importadores                                                                                                                            | Mapeamento de entidades do DataHub.                                                                                                                                                                      |
| **`src/config/workflow-templates.ts`**                      | IMPLEMENTADO_PARCIAL                                  | 6 templates, 1 importador (`WorkflowTemplatesGallery`)                                                                                        | Blueprints estáticos de workflow; injetados no canvas.                                                                                                                                                   |
| **`src/lib/invokeWithRetry.ts`**                            | MORTO_OU_ABANDONADO                                   | 0 importadores (42 linhas)                                                                                                                    | Retry para Edge Functions transientes, nunca adotado.                                                                                                                                                    |
| **`src/lib/tracing/tracingExporters.ts`**                   | IMPLEMENTADO_PARCIAL                                  | Importado só por `src/lib/tracing.ts:19-20`                                                                                                   | Exporta traces para `agent_events`/Langfuse. Como o banco está vazio, nada é lido de volta.                                                                                                              |
| **`src/lib/otel-genai.ts`**                                 | SUGERIDO_OU_INICIADO                                  | Só `src/test/otel-genai.test.ts:5,23`                                                                                                         | 0 importadores em produção. Convenções semânticas OTel GenAI escritas e testadas, nunca ligadas.                                                                                                         |
| **`src/lib/ag-ui/protocol.ts` + `ag-ui/index.ts`**          | SUGERIDO_OU_INICIADO                                  | Só `src/test/streaming.test.ts:5,14,23`                                                                                                       | Protocolo AG-UI/SSE implementado + testado, **zero consumo em produção**.                                                                                                                                |
| **`src/lib/mcp/index.ts`**                                  | MORTO_OU_ABANDONADO (barrel)                          | 0 importadores; consumidores usam `mcpClient`/`mcpRegistry` direto                                                                            | `MCPServersPanel.tsx:3` importa os submódulos, não o barrel.                                                                                                                                             |
| **`src/lib/validations/brazilianDocuments.ts`**             | MORTO_OU_ABANDONADO                                   | 0 importadores                                                                                                                                | Validadores CPF/CNPJ/CEP órfãos. Note: `src/lib/securityGuards.ts:6-10` reimplementa detecção de CPF/CNPJ por regex — **lógica duplicada**.                                                              |
| **`src/hooks/useRetryAction.ts`**                           | MORTO_OU_ABANDONADO                                   | 0 importadores                                                                                                                                | Hook de retry + circuit breaker sem consumidor.                                                                                                                                                          |
| **`src/hooks/index.ts` (barrel)**                           | MORTO_OU_ABANDONADO                                   | 0 importadores de `@/hooks`                                                                                                                   | Barrel de 5 hooks nunca usado; todos importam por caminho completo.                                                                                                                                      |
| **`src/stores/index.ts` (barrel)**                          | MORTO_OU_ABANDONADO                                   | 0 importadores de `@/stores`                                                                                                                  | Idem, 7 stores exportados, nenhum consumo via barrel.                                                                                                                                                    |
| **`src/lib/llmPricing.ts`**                                 | IMPLEMENTADO_PARCIAL / auto-declarado obsoleto        | `src/lib/llmPricing.ts:3` `DEPRECATED: Use the cost-calculator Edge Function`                                                                 | 6 importadores ainda usam a tabela deprecada. Refactor abandonado no meio: **v1 é o que roda**.                                                                                                          |
| **`src/lib/tracing.ts` (T19 rewrite)**                      | IMPLEMENTADO_TOTAL                                    | `src/lib/tracing.ts:2` "(T19 rewrite)"                                                                                                        | Refactor concluído — v1 removida, sub-módulos em `tracing/`. Não é caso de coexistência.                                                                                                                 |
| **`researchConfig` duplicado**                              | IMPLEMENTADO_PARCIAL                                  | `src/lib/researchConfig.ts` (hook + persistência) e `src/lib/validations/researchConfig.ts` (Zod)                                             | Não é v1/v2: são camadas distintas com o mesmo nome. Confusão de nomenclatura, não duplicação lógica.                                                                                                    |
| **`src/lib/utils.ts` / `logger.ts` / `a11y.ts`**            | IMPLEMENTADO_TOTAL                                    | 151 / 171 / 35 importadores                                                                                                                   | Núcleo vivo e amplamente usado.                                                                                                                                                                          |
| **`src/lib/agentService.ts`**                               | IMPLEMENTADO_TOTAL                                    | 40 importadores; `:11-27` `getWorkspaceId()`                                                                                                  | CRUD de agentes contra `agents` (tabela **vazia**, RLS on, 5 policies).                                                                                                                                  |
| **`src/lib/supabaseExtended.ts` (`fromTable`)**             | IMPLEMENTADO_TOTAL / risco                            | `:29` `looseClient.from(table)` — 43 importadores                                                                                             | Escapa da tipagem gerada via `as unknown as SupabaseClient`. Perde checagem de schema em 43 pontos.                                                                                                      |
| **`src/lib/sanitize.ts` (DOMPurify)**                       | IMPLEMENTADO_TOTAL                                    | `:11-30` config restritiva                                                                                                                    | 3 importadores. Implementação sólida.                                                                                                                                                                    |
| **`src/lib/securityGuards.ts` (PII + injection)**           | IMPLEMENTADO_TOTAL (puro)                             | `:3-15` PII, `:45+` injection                                                                                                                 | Funções puras corretas; 2 importadores.                                                                                                                                                                  |
| **`src/hooks/useTracesData.ts`**                            | IMPLEMENTADO_PARCIAL                                  | `:6` "Replaces MOCK_TRACES"; `:57` query em `trace_events`                                                                                    | Mock removido, mas `trace_events` = 0 linhas → telas de observabilidade mostram zeros.                                                                                                                   |
| **`src/hooks/useBillingData.ts`**                           | IMPLEMENTADO_PARCIAL                                  | `:6` "Replaces MOCK_USAGE"; query em `usage_records`                                                                                          | Mesmo padrão: real, porém sem dado.                                                                                                                                                                      |
| **`src/lib/alertMetrics.ts`**                               | IMPLEMENTADO_PARCIAL                                  | `src/lib/alertMetrics.ts:2-3` "a partir de traces **mockados** (`agent_traces`)"                                                              | O próprio docstring assume fonte mockada.                                                                                                                                                                |
| **`src/lib/metricsAlertRules.ts`**                          | IMPLEMENTADO_PARCIAL                                  | `:2` "regras configuráveis (**localStorage**)"                                                                                                | Sistema de alertas de métricas cujo estado vive no navegador. Some ao trocar de máquina.                                                                                                                 |
| **Estado em `localStorage` (12 módulos)**                   | IMPLEMENTADO_PARCIAL                                  | ver §5                                                                                                                                        | Features "de plataforma" persistidas só no browser.                                                                                                                                                      |
| **Stores Zustand vivos**                                    | IMPLEMENTADO_TOTAL                                    | `cerebroStore` (27 imp.), `agentBuilderStore` (26), `oracleStore` (12)                                                                        | Núcleo real de estado.                                                                                                                                                                                   |
| **`src/stores/datahubStore.ts`**                            | IMPLEMENTADO_PARCIAL                                  | 1 importador (`DataHubPage.tsx:2`)                                                                                                            | Vivo, mas com superfície mínima.                                                                                                                                                                         |
| **`src/stores/uiStore.ts`**                                 | IMPLEMENTADO_PARCIAL                                  | 1 importador de produção (`OnboardingTour.tsx:6`) + testes                                                                                    | Store de UI global usada por um único componente.                                                                                                                                                        |

---

## 2. VEREDITO — RBAC

**Números reais (código vs. banco):**

| Item                   | Afirmado no inventário | Real no código                                    | Real no banco                                      |
| ---------------------- | ---------------------- | ------------------------------------------------- | -------------------------------------------------- |
| Roles                  | 5 hierárquicos         | **5** chaves em `rbacService.ts:59`               | **3** linhas em `roles`, com chaves **diferentes** |
| Permissões granulares  | 37+                    | **37** literais de tipo em `rbacService.ts:47-57` | **0** linhas em `permissions`                      |
| Vínculo role→permissão | —                      | —                                                 | **0** linhas em `role_permissions`                 |

**As 5 roles do código** (`src/services/rbacService.ts:59`): `workspace_admin`, `agent_editor`, `agent_viewer`, `operator`, `auditor`.
**As 3 roles do banco** (`SELECT key FROM roles`): `workspace_admin`, `editor`, `viewer`.
**Uma terceira taxonomia** existe em `src/types/agentTypes.ts:279` e `src/lib/validations/dialogSchemas.ts:10`: `admin | editor | viewer | operator`.
**Uma quarta** está gravada em `workspace_members.role`: `admin` (2×) e `workspace_admin` (1×).

Ou seja: **quatro vocabulários de papel incompatíveis**. `agent_editor`, `agent_viewer` e `auditor` não existem no banco; `editor` e `viewer` não existem no tipo `RoleKey`. Um usuário com `role_key='editor'` cai em `levels[state.role] ?? 0` → nível 0 (`useRBAC.ts:121`) e é tratado como se não tivesse papel algum.

**As 37 permissões declaradas** (agents.create/read/update/delete/deploy/test; workflows.create/read/update/delete/execute; knowledge.read/write/delete/manage; oracle.query/configure/history/write; datahub.read/write/connections; team.read/invite/remove/roles; settings.read/write/api_keys/billing; monitoring.read/traces/audit; tools.read/write; integrations.read/write) existem **apenas como união de string literals em TypeScript**. Não há uma única linha na tabela `permissions`. `getUserPermissions()` (`rbacService.ts:113-138`) sempre retorna `Set` vazio.

**Enforcement no servidor: NÃO EXISTE.**

- `roles`, `permissions`, `role_permissions`, `user_roles`: **RLS desligada** (`relrowsecurity=false`), **0 policies**, e `GRANT INSERT/UPDATE/DELETE/TRUNCATE` para `anon` e `authenticated`.
- A função `get_user_workspace_ids()` que o `docs/adr/005-rbac-client-side.md:14` cita como pilar anti-recursão **não existe** no `pg_proc`.
- `workspace_members` tem 1 policy criada mas **RLS desligada** — a policy é decorativa.

**Consequência prática, encadeada:**

1. Qualquer cliente com a anon key pública faz `INSERT INTO user_roles (user_id, role_key, workspace_id) VALUES (<meu uid>, 'workspace_admin', <ws>)` — nada impede.
2. `useRBAC.ts:103` retorna `true` para tudo quando `role === 'workspace_admin'`.
3. Nenhuma RLS impede as escritas subsequentes nas 176 tabelas sem RLS com grant `anon`.

O ADR-005 diz "UI enforcement is UX only — not a security boundary / All security-critical access must be enforced by RLS". A camada de UI foi construída; **a camada de RLS que a torna segura não foi**. Hoje o RBAC não é "contornável" — ele é **inexistente**, e a UI é o único obstáculo.

---

## 3. VEREDITO — `src/data/`

**É catálogo de conteúdo hardcoded, não mock de banco** — com uma exceção morta e um mock declarado.

| Arquivo                  | Linhas | Conteúdo                                                                                                | Quem consome                                                                                                 | Veredito                                                                                                                                                                                                                                                                     |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agentTemplates.ts`      | 757    | 41 templates de agente (identidade, modelo, prompt, tools, guardrails) + `TEMPLATE_CATEGORIES` (`:741`) | `AgentTemplatesPage.tsx:26`, `CreateAgentWizard.tsx:22`, `RecentCurationsPanel.tsx:51`, 3 services, 8 testes | **Real e em produção.** É a fonte de verdade dos templates: `CreateAgentWizard.tsx:53` inicializa o state com `STATIC_TEMPLATES` e só _acrescenta_ o que vier de `agent_templates` (`:87`) — tabela que tem **0 linhas**. Portanto 100% do que a tela mostra vem do arquivo. |
| `curatedSkills.ts`       | 789    | 72 skills curadas em PT-BR, 10 departamentos, com `qualityScore` inventado (0-100)                      | **Apenas 3 arquivos de teste**                                                                               | **MORTO.** Docstring `:9-11` promete seed em `skill_registry`; não existe código de seed; `skill_registry` = 0 linhas. 789 linhas de catálogo fictício que nenhuma tela renderiza.                                                                                           |
| `quickAgentTemplates.ts` | 710    | 7 tipos de agente × 3 variantes de prompt + `QUICK_AGENT_MOCK_INPUTS` (`:681`)                          | 14 importadores reais (wizard rápido)                                                                        | **Real.** O bloco `MOCK_INPUTS` é dado fictício **assumido**: exemplos de entrada para o painel de teste do wizard (`:683-701`), nome honesto.                                                                                                                               |
| `guardrailPresets.ts`    | 244    | 14 presets de guardrail (LGPD, OWASP-LLM, NIST)                                                         | `GuardrailsLibrary.tsx:11`                                                                                   | **Real.** Catálogo estático legítimo, análogo a uma biblioteca de templates.                                                                                                                                                                                                 |
| `agentBuilderData.ts`    | 113    | 20 abas do builder + `DEFAULT_AGENT` + `LIFECYCLE_STAGES`                                               | 9 importadores                                                                                               | **Real.** É configuração de UI, não dado de negócio.                                                                                                                                                                                                                         |

**Resposta direta:** `src/data/` **não** é um mock que alimenta telas fingindo ser banco. É um catálogo de conteúdo editorial legítimo (templates, presets) que roda porque o banco correspondente está vazio. O risco real não é fingimento — é que **41 templates e 14 presets nunca serão editáveis pelo usuário** enquanto as tabelas `agent_templates`/`guardrail_policies` seguirem vazias, e que **789 linhas (30% do diretório) são código morto**.

---

## 4. VEREDITO — i18n

**Contagem medida (parser de chaves nível-2 em `src/i18n/translations.ts`):**

| Locale  | Bloco          | Chaves  |
| ------- | -------------- | ------- |
| `pt-BR` | linhas 19-395  | **332** |
| `en-US` | linhas 397-773 | **332** |

**Simetria perfeita — não há buraco de tradução.** Ambos os idiomas estão 100% preenchidos.

**Mas o dicionário é praticamente inerte:**

- `I18nProvider` está montado (`src/App.tsx:224`) e funciona (interpolação, `localStorage`, fallback de locale).
- **Uma única página** chama `t()`: `src/pages/RoutingConfigPage.tsx:39`, usando **23 chaves únicas**.
- `src/components/layout/AppSidebar.tsx:194` importa `useI18n` mas usa só `{ locale, setLocale }` — é o seletor de idioma, não consome traduções.
- Todo o resto da UI tem strings PT-BR hardcoded no JSX.

**Cobertura efetiva: 23 de 332 chaves (6,9%). 618 strings traduzidas (309 × 2) são código morto.** Trocar o idioma para `en-US` muda 23 rótulos de uma página e mais nada.

---

## 5. VEREDITO — 2FA

**Existe código real, mas o recurso não funciona e é inseguro.**

O que está implementado (`src/hooks/use2FA.ts`, 66 linhas, biblioteca `otpauth`):

- `generateSecret()` (`:34-38`): gera segredo de 20 bytes e URI `otpauth://` — correto.
- `verifyToken()` (`:40-47`): valida TOTP com janela ±1 — correto, RFC 6238.
- UI existe: `src/components/security/TwoFactorSetup.tsx:16` — único consumidor.

Por que **não funciona**:

1. **A gravação sempre falha.** `enable()` (`:50`) faz `upsert` em `user_2fa`. No banco, `user_2fa` tem **RLS habilitada com 0 policies** → deny-all para `anon` e `authenticated`. A tabela tem **0 linhas**. Nenhum usuário conseguiu ativar 2FA.
2. **Nada verifica 2FA no login.** `AuthContext.signIn()` (`:68-107`) nunca consulta `user_2fa`. `use2FA` é importado por exatamente um componente de _setup_. Mesmo se a gravação funcionasse, ativar 2FA não adicionaria nenhum passo ao login.
3. **O caminho AAL2 do Supabase é decorativo.** `AuthContext.tsx:99-102` detecta que um admin não tem AAL2 e chama `logger.warn` — não bloqueia nem redireciona.

Por que é **inseguro** (caso alguém "conserte" a policy): 4. **Segredo TOTP em claro** (`:50-52`): `secret` gravado sem cifra, em tabela que já recebeu `GRANT ALL` para `anon`. 5. **Backup codes com `Math.random()`** (`:48`): PRNG não-criptográfico, 8 códigos de 8 chars — previsíveis. 6. **Verificação 100% client-side** (`:40-47`): `enable()` confia no `verifyToken()` do próprio browser.

**Classificação: MORTO_OU_ABANDONADO.** É uma casca de 2FA — funcionalmente desligada em três pontos independentes.

---

## 6. Módulos órfãos — com prova de ausência de importador

Método: para cada módulo, `grep -rl "<caminho>'" src/ supabase/` excluindo o próprio arquivo. Zero resultados = órfão.

### Órfãos absolutos (nenhum importador, nem teste)

| Arquivo                                     | Linhas | O que é                                          |
| ------------------------------------------- | ------ | ------------------------------------------------ |
| `src/config/env.ts`                         | 46     | Validação de env vars "fail-fast" que nunca roda |
| `src/config/huggingface.ts`                 | 125    | Config de 26 integrações HuggingFace             |
| `src/config/huggingface-models.ts`          | 31     | Catálogo de preços/tiers de modelos              |
| `src/config/auto-facts.ts`                  | 64     | 19 fatos institucionais do Super Cérebro         |
| `src/types/hfTypes.ts`                      | 78     | Tipos HuggingFace                                |
| `src/lib/invokeWithRetry.ts`                | 42     | Retry de Edge Functions                          |
| `src/lib/validations/brazilianDocuments.ts` | ~90    | Validadores CPF/CNPJ/CEP                         |
| `src/lib/mcp/index.ts`                      | 2      | Barrel MCP (consumidores usam submódulos)        |
| `src/lib/ag-ui/index.ts`                    | 2      | Barrel AG-UI                                     |
| `src/hooks/useRetryAction.ts`               | ~95    | Retry + circuit breaker                          |
| `src/hooks/index.ts`                        | 5      | Barrel de hooks                                  |
| `src/stores/index.ts`                       | 7      | Barrel de stores                                 |

**Subtotal: ~587 linhas sem nenhum consumidor.**

### Órfãos de produção (só testes importam)

| Arquivo                     | Linhas | Prova                                                                                                          |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `src/data/curatedSkills.ts` | 789    | Só `src/test/curated-skills.test.ts:9`, `template-skill-links.test.ts:10`, `template-link-coverage.test.ts:11` |
| `src/lib/otel-genai.ts`     | ~110   | Só `src/test/otel-genai.test.ts:5,23`                                                                          |
| `src/lib/ag-ui/protocol.ts` | ~120   | Só `src/test/streaming.test.ts:5,14,23`                                                                        |

**Subtotal: ~1.019 linhas testadas mas nunca executadas em produção.**

**Total de código morto identificado: ~1.606 linhas (6% do lote), sem contar as 618 strings de i18n inertes nem os 37 identificadores de permissão sem lastro.**

---

## 7. Dado fictício / hardcoded — com arquivo:linha

| Item                                                                         | Localização                                                                                       | Natureza                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 72 skills "curadas" com `qualityScore` atribuído à mão (88, 90, 91, 92, 94…) | `src/data/curatedSkills.ts:31-780`                                                                | Catálogo inventado, nunca semeado no banco, só testes leem                    |
| 41 prompts de agente com "Promo Brindes" embutido                            | `src/data/agentTemplates.ts:59,73,87,101,115,129,143,171,185,213,241,276,306,320,348,362,378,394` | Conteúdo real da empresa hardcoded no bundle                                  |
| `QUICK_AGENT_MOCK_INPUTS` — 14 entradas de exemplo                           | `src/data/quickAgentTemplates.ts:681-710`                                                         | Mock **declarado** (painel de teste do wizard) — aceitável                    |
| Tabela de preços LLM auto-declarada obsoleta                                 | `src/lib/llmPricing.ts:3,18-30`                                                                   | "DEPRECATED: Use the cost-calculator Edge Function"; ainda tem 6 importadores |
| Preços/janelas de contexto de 12 modelos                                     | `src/config/huggingface-models.ts:13-15`                                                          | Órfão; valores de 2026 hardcoded                                              |
| Project ID de banco desativado como fallback                                 | `src/config/env.ts:28` `'tdprnylgyrogbbhgdoik'`                                                   | Aponta para banco que a `.env.example:9-19` já abandonou                      |
| Comentário afirmando banco externo separado                                  | `src/integrations/supabase/externalClient.ts:4`                                                   | Contradiz `.env.example:17-19` (mesmo projeto)                                |
| Métricas de alerta a partir de "traces mockados"                             | `src/lib/alertMetrics.ts:2-3`                                                                     | Docstring assume fonte mockada                                                |
| 6 blueprints de workflow "Promo Brindes"                                     | `src/config/workflow-templates.ts:3,125`                                                          | Conteúdo fixo                                                                 |
| 19 fatos institucionais com placeholder `{value}`                            | `src/config/auto-facts.ts:24-40`                                                                  | Órfão; `{value}` nunca é substituído por ninguém                              |
| Thresholds default de alerta (800ms, US$0.05, 10%, 5%)                       | `src/lib/alertMetrics.ts:27-33`                                                                   | Números escolhidos sem base medida                                            |
| `ip_address: null` fixo no log de auth                                       | `src/contexts/AuthContext.tsx:87`                                                                 | Campo de auditoria nunca preenchido                                           |

### `Math.random()` — 5 ocorrências, 1 crítica

| Local                                     | Uso                         | Risco                                                               |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------- |
| `src/hooks/use2FA.ts:48`                  | **Backup codes de 2FA**     | **CRÍTICO** — PRNG não-criptográfico para credencial de recuperação |
| `src/lib/signedUrlCache.ts:158`           | Jitter de expiração (150ms) | OK                                                                  |
| `src/lib/skillComposer/skillDraft.ts:422` | ID local de rascunho        | OK                                                                  |
| `src/lib/slo/useDrilldownAuditLog.ts:152` | ID de evento local          | OK                                                                  |
| `src/hooks/useFilterPersistence.ts:42`    | ID de filtro salvo          | OK                                                                  |

### Estado de plataforma vivendo em `localStorage` (12 módulos)

`src/lib/researchConfig.ts` (8×), `src/hooks/useFilterPersistence.ts` (5×), `src/hooks/useAgentSLOTargets.ts` (4×), `src/lib/traceBookmarks.ts` (3×), `src/lib/replayState.ts` (3×), `src/lib/metricsAlertRules.ts` (3×), `src/hooks/useObsidianMode.ts` (2×), `src/hooks/useChecklistAutoUnlock.ts` (2×), `src/stores/agentDrilldownStore.ts`, `src/lib/validations/researchConfig.ts`, `src/lib/skills/attribution.ts`, `src/lib/signedUrlCache.ts`, `src/i18n/I18nProvider.tsx`.

Destaques problemáticos: **regras de alerta de métricas** (`metricsAlertRules.ts:2`) e **targets de SLO** (`useAgentSLOTargets.ts`) são features de plataforma multi-usuário persistidas apenas no navegador de quem as criou.

### `TODO` / `not implemented`

Busca por `TODO|FIXME|not implemented|coming soon` no lote retorna **zero marcadores reais** — todos os hits são a palavra portuguesa "todo/todos" ou strings de detecção de placeholder em validadores (`src/lib/validations/quickAgentSchema.ts:162-174`, `src/lib/skills/descriptionEnrichment.ts:44-45`). O código não sinaliza suas próprias lacunas; elas só aparecem confrontando com o banco.

---

## 8. Síntese do lote

O `src/lib` + estado compartilhado é **bem escrito e mal conectado**. A qualidade de engenharia interna é alta: funções puras testadas, sanitização com DOMPurify, tracing alinhado a OTel, validadores Zod, i18n com interpolação correta. O problema não é a escrita — é que **as pontas não estão ligadas**:

1. **RBAC**: 37 permissões em TypeScript, 0 no banco. 5 roles no código, 3 no banco, com nomes que não batem. O ADR cita uma função SQL que não existe. As 4 tabelas de RBAC têm RLS desligada e `GRANT ALL` para `anon` — qualquer visitante se promove a admin.
2. **Auditoria**: 20 ações de audit declaradas, RPC inexistente, gravação falha em silêncio.
3. **2FA**: implementado com biblioteca correta, tabela deny-all, nunca verificado no login, segredo em claro, backup codes com `Math.random()`.
4. **i18n**: 664 strings traduzidas, 23 em uso.
5. **`src/data/`**: catálogo editorial legítimo (não é fraude), mas 789 das 2.613 linhas são um catálogo que nada consome, com uma docstring que promete um seed que não existe.
6. **~1.606 linhas de código órfão**, incluindo a própria validação de ambiente (`config/env.ts`) que existiria para impedir exatamente o tipo de silêncio que hoje ocorre.

---

## Arquivos lidos

**Integral:** `src/hooks/useRBAC.ts`, `src/services/rbacService.ts`, `src/contexts/AuthContext.tsx`, `src/hooks/use2FA.ts`, `src/i18n/I18nProvider.tsx`, `src/hooks/useI18n.ts`, `src/hooks/useCurrentWorkspace.ts`, `src/hooks/index.ts`, `src/stores/index.ts`, `src/config/env.ts`, `src/lib/invokeWithRetry.ts`, `src/lib/mcp/index.ts`, `src/lib/ag-ui/index.ts`, `src/integrations/supabase/externalClient.ts`, `src/integrations/supabase/client.ts`, `docs/adr/005-rbac-client-side.md`, `.env.example`.

**Parcial (cabeçalho/estrutura/trechos-chave):** `src/data/agentBuilderData.ts`, `src/data/agentTemplates.ts`, `src/data/curatedSkills.ts`, `src/data/guardrailPresets.ts`, `src/data/quickAgentTemplates.ts`, `src/i18n/translations.ts`, `src/lib/supabaseExtended.ts`, `src/lib/auditService.ts`, `src/lib/securityGuards.ts`, `src/lib/sanitize.ts`, `src/lib/llmPricing.ts`, `src/lib/alertMetrics.ts`, `src/lib/tracing.ts`, `src/lib/tracing/tracingTypes.ts`, `src/lib/tracing/tracingExporters.ts`, `src/lib/researchConfig.ts`, `src/lib/validations/researchConfig.ts`, `src/lib/agentService.ts`, `src/hooks/use-data.ts`, `src/hooks/useTracesData.ts`, `src/hooks/useBillingData.ts`, `src/config/skill-departments.ts`, `src/config/datahub-entities.ts`, `src/config/workflow-templates.ts`, `src/config/auto-facts.ts`, `src/config/huggingface.ts`, `src/components/rbac/AccessControl.tsx`, `src/components/rbac/ProtectedRoute.tsx`, `src/components/agents/CreateAgentWizard.tsx`, `src/pages/AgentTemplatesPage.tsx`, `src/pages/RoutingConfigPage.tsx`, `src/components/security/GuardrailsLibrary.tsx`, `src/components/layout/AppSidebar.tsx`.

**Análise estrutural (todos os 92 arquivos de `src/lib`, 44 de `src/hooks`, 12 de `src/stores`, 10 de `src/config`, 4 de `src/types`):** contagem de linhas, docstring de topo e grafo de importadores.

**Consultas SQL executadas no banco `qdlnzopxrlsoljcrcmzv`:** contagem de tabelas (215), RLS/policies/linhas por tabela crítica, listagem completa de tabelas com dados (5), conteúdo de `roles`/`user_roles`/`workspace_members`, existência de funções (`log_audit_entry`, `is_user_locked_out`, `get_user_workspace_ids`), grants de `anon`/`authenticated`.
