# ESTADO ATUAL DO SISTEMA — Fator X V2 / Nexus Agents Studio

> **Auditoria de estado executada em:** 2026-08-16
> **Banco auditado:** `qdlnzopxrlsoljcrcmzv` (produção, **somente leitura** — zero DDL, zero DML)
> **Método:** medição direta. Nenhuma afirmação de documento foi herdada como fato.
> **Branch:** `claude/system-status-roadmap-bowcbc`

---

## 1. Veredito em uma tela

**O sistema está construído e desabitado.**

O código é de qualidade acima da média — 6.222 testes passam, `tsc --noEmit` sai limpo, não há um único método stub em 166 services. Mas o backend de dados nunca foi entregue: **210 das 215 tabelas de produção estão vazias**, 98 das 119 RPCs que o frontend chama não existem, e nenhum dos 11 jobs agendados foi criado. O que existe é um frontend completo e 86 edge functions ligadas a um banco que nunca recebeu dado.

Isso não é um sistema "quase pronto com pendências". É um sistema onde a camada de apresentação e a de aplicação foram concluídas e a camada de dados parou no meio — e onde a documentação afirma o contrário.

**Além disso, há três exposições de segurança que precisam de decisão hoje**, independentes de qualquer roadmap (§4).

---

## 2. Contagem honesta

### 2.1 Pelo critério "o fio de código está ligado"

| Dimensão                               |  ✅ TOTAL | 🟨 PARCIAL | 🟦 SUGERIDO | ⬛ MORTO |    Base |
| -------------------------------------- | --------: | ---------: | ----------: | -------: | ------: |
| Páginas (rotas)                        |       104 |         20 |          16 |        1 |     141 |
| Services (frontend)                    |       130 |         31 |           0 |        5 |     166 |
| Edge Functions                         |        51 |         31 |           1 |        3 |      86 |
| UI de Agentes (agents/builder/cérebro) |        45 |         17 |           7 |        7 |      76 |
| Componentes — lote A                   |         9 |         51 |          13 |       10 |      83 |
| Componentes — lote B                   |        48 |         13 |           4 |        7 |      72 |
| Integrações com terceiros              |         3 |         17 |           6 |        6 |      32 |
| **Total**                              |   **390** |    **180** |      **47** |   **39** | **656** |
| **%**                                  | **59,5%** |  **27,4%** |    **7,2%** | **5,9%** |    100% |

### 2.2 Pela regra de ouro — _pronto = em produção com uso real_

Aplicando o critério que governa esta auditoria, **a tabela acima cai**. Uma funcionalidade que existe em código, passa em teste e nunca foi executada por um usuário é 🟨, não ✅.

| Evidência de uso real      | Medição                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tabelas com qualquer linha | **5 de 215** (`roles`=3, `workspaces`=3, `workspace_members`=3, `user_roles`=1, `notification_templates`=1) |
| Usuários cadastrados       | **2**                                                                                                       |
| Buckets de storage         | **0**                                                                                                       |
| Objetos em storage         | **0**                                                                                                       |
| Jobs agendados ativos      | **0** (11 declarados em migrations)                                                                         |
| Registros em `audit_log`   | **0**                                                                                                       |

**Nenhuma funcionalidade de negócio tem prova de execução.** Os 390 ✅ da tabela 2.1 significam _"o caminho está ligado"_, não _"já funcionou"_. Pela regra de ouro, o número de funcionalidades ✅ **IMPLEMENTADO_TOTAL** é essencialmente restrito à infraestrutura de autenticação e workspace.

Registro os dois números porque servem a decisões diferentes: 2.1 mede quanto trabalho de engenharia já existe; 2.2 mede quanto do sistema está em uso. **Ambos são verdadeiros. Só o segundo responde "o sistema está pronto?".**

---

## 3. A causa-raiz: o ambiente não nasce do repositório

Este é o achado estrutural que explica quase todos os outros.

O próprio repositório admite, por escrito, em `supabase/migrations/20260330000001_schema_baseline.sql:1-8`:

> `-- Fator X V2 schema baseline — 193 tables applied via Supabase Dashboard`
> `-- IMPORTANT: The full schema was applied interactively via the Dashboard and cannot be fully reconstructed here.`

**193 das 215 tabelas nunca tiveram DDL versionado.** O que existe no lugar são stubs mínimos. Rodar as 326 migrations do zero produz tabelas com os nomes certos e as colunas erradas.

### 3.1 O descompasso, medido nos dois sentidos

| Objeto               | Declarado no repo | Vivo em produção |                  Drift |
| -------------------- | ----------------: | ---------------: | ---------------------: |
| Tabelas (migrations) |              215+ |              215 |      stubs sem colunas |
| Tabelas (`types.ts`) |               276 |              215 |       **61 fantasmas** |
| RPCs (`types.ts`)    |               119 |               21 |       **98 fantasmas** |
| Views                |                16 |               14 |                      2 |
| RLS ligado           |       222 tabelas |           **39** | **183 não executadas** |
| Policies             |               384 |               58 |     326 não executadas |
| Triggers             |               124 |            **2** |     122 não executados |
| Jobs `pg_cron`       |                11 |            **0** |      11 não executados |
| Migrations           |      326 arquivos |    318 aplicadas |    **8 nunca rodaram** |

### 3.2 As 8 migrations não aplicadas — identificadas

| Versão           | Arquivo                                  | O que deveria fazer                |
| ---------------- | ---------------------------------------- | ---------------------------------- |
| `20260332000001` | `fix_stub_schemas.sql` (310 l.)          | Enums + colunas faltantes          |
| `20260332000002` | `consolidated_schema_fixes.sql` (646 l.) | Correções consolidadas de esquema  |
| `20260420000001` | `fix_audit_trigger_fn.sql`               | Corrigir função de auditoria       |
| `20260420000002` | `fix_audit_trigger_fn_v2.sql`            | Idem, v2                           |
| `20260421000001` | `fix_agent_versions_columns.sql`         | Colunas de versionamento de agente |
| `20260421000002` | `fix_agent_usage_columns.sql`            | Colunas de custo/uso               |
| `20260513000001` | `drop_legacy_hybrid_search.sql`          | Remover sobrecarga ambígua         |
| `20260804000001` | `missing_fk_indexes.sql` (156 l.)        | 16 índices de FK                   |

**Causa-raiz de duas delas, provada:** `20260332000001` e `20260332000002` têm **data impossível no nome** — mês 03, **dia 32**. São os únicos 2 arquivos entre 326 com data inválida. O parser de migrations as ignora silenciosamente. E são justamente as duas maiores.

**Causa-raiz das demais:** `.github/workflows/ci.yml` **não tem `supabase db push`**. Nenhuma migration escrita à mão tem caminho automatizado até o banco. Das 326, 288 têm nome-UUID (geradas pelo Lovable _após_ aplicar) e 38 têm nome descritivo (escritas no git) — e **todos os objetos fantasma vêm da segunda classe**.

### 3.3 Consequências ainda vivas em produção

| Funcionalidade prometida   | Estado real, verificado no banco                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versionamento de agentes   | `agent_versions` tem 7 colunas — **sem** `name`, `persona`, `mission`, `system_prompt`, `promoted_at`. Não há onde gravar o snapshot                                                                                       |
| Custo/uso por agente       | `agent_usage` **sem** `requests`, `tokens_input/output`, `total_cost_usd`, `avg_latency_ms`                                                                                                                                |
| Trilha de auditoria (LGPD) | RPC `log_audit_entry` **não existe**; 6 pontos do código a chamam; `auditService.ts:44` engole o erro ("Audit logging failed silently")                                                                                    |
| Triggers de auditoria      | `audit_trigger_fn` **não existe**                                                                                                                                                                                          |
| Busca híbrida RAG          | `hybrid_search` **não existe em nenhuma sobrecarga**                                                                                                                                                                       |
| Telemetria/traces          | Tabela `trace_events` **não existe** (só a view `trace_events_v`); é o destino de toda a telemetria em `lib/tracing/tracingExporters.ts:30` e das abas de observabilidade (`useTracesData.ts:58`, `useBillingData.ts:112`) |
| RBAC                       | `permissions` e `role_permissions` com **0 linhas**; `get_user_workspace_ids()` — pilar do ADR-005 — **não existe**                                                                                                        |

---

## 4. Riscos de segurança, por gravidade

### 🔴 1. Execução de SQL arbitrário exposta ao público

`public.exec_sql(query text)` existe em produção: `SECURITY DEFINER`, owner `postgres`, e **`anon` tem `EXECUTE`**. O ramo final da função (`EXECUTE query; RETURN '[]'`) aceita qualquer comando, inclusive DDL. Quem possui a chave anônima do frontend — que é pública por natureza — executa SQL como superusuário e ignora todo o RLS.

**Nuance importante:** **nenhuma migration do repositório cria essa função** (0 ocorrências em 326 arquivos). Ela nasceu fora do versionamento — o gateway MCP de operação faz _bootstrap_ dela. É ferramenta de administração que ficou ligada em produção com grant público.

> **Correção de um achado de subagente:** o lote de Edge Functions reportou "`exec_sql` não existe". Está **correto quanto ao repositório** e **incorreto quanto ao banco**. Verifiquei diretamente: a função existe. Registro ainda que a assinatura viva é `exec_sql(query text)` enquanto `datahub-query/index.ts:844` chama `rpc('exec_sql', { sql })` — nome de parâmetro divergente, o que faz essa chamada específica falhar mesmo com a função presente.

### 🔴 2. Escalação de privilégio via `user_roles`

`user_roles`: **RLS desligado** + `anon` com `SELECT, INSERT, UPDATE, DELETE, TRUNCATE`. Qualquer visitante insere o próprio papel como `workspace_admin`. E `useRBAC.ts:102-103` faz `if (role === 'workspace_admin') return true` — libera a aplicação inteira.

Mesma exposição em `credential_vault`, `api_keys`, `roles` e `workspace_members`.

### 🔴 3. 176 das 215 tabelas sem RLS, todas legíveis por `anon`

Confirmei o grant: `anon` tem `SELECT` nas 176. Hoje o impacto é baixo porque estão vazias — **no dia em que houver dado, é vazamento total**. Inclui `crm_deals`, `crm_contacts`, `documents`, `chat_messages`, `consent_records`, `data_subject_requests`.

**Origem:** não há um `GRANT ALL TO anon` no repositório — a busca é vazia, e há inclusive 10 `REVOKE ... FROM anon`. A origem é o _default privilege_ da plataforma Supabase, herdado por toda tabela criada via Dashboard. **O achado não tem uma linha de origem; tem a ausência de uma.** RLS é a única defesa nesse modelo, e as migrations que a ligariam nunca executaram (§3.1).

### 🟠 4. Policies inertes — falsa sensação de proteção

5 tabelas têm policies escritas **com RLS desligado**, portanto sem efeito: `prompt_versions` (4 policies), `workspace_members` (1), e 3 tabelas `*_old`.

### 🟠 5. Edge function pública com `service_role`

`rag-embed-backfill` está em `config.toml:9-10` com `verify_jwt = false`, não tem checagem de auth no código (`:53-64`), usa `SERVICE_ROLE_KEY` e ainda a repassa como bearer a outra function (`:89`). Qualquer requisição da internet dispara escritas privilegiadas e consumo de cota de embedding.

Outras 16 functions usam `SERVICE_ROLE_KEY` sem checagem de identidade própria, dependendo apenas do `verify_jwt` da plataforma — incluindo `validate-access` e `cron-executor`.

### 🟡 6. Quatro project IDs de Supabase circulando no repositório

| ID                     | Onde                                | Papel                           |
| ---------------------- | ----------------------------------- | ------------------------------- |
| `qdlnzopxrlsoljcrcmzv` | `config.toml:1`, `.env.example`     | **o real**                      |
| `tdprnylgyrogbbhgdoik` | `externalClient.ts:4`               | "banco externo" abandonado      |
| `tifbqkyumdxzmxyyoqlu` | `MIGRATION-COLAR-NO-SUPABASE.sql:4` | alvo de um SQL para colar à mão |
| `fqdohnmgmtaycfwsioik` | 3 migrations de trigger             | destino de alertas e WhatsApp   |

Migrations de trigger postam alertas de segurança e mensagens de WhatsApp para o **projeto errado**, com o JWT anônimo desse projeto embutido. Risco hoje é latente: verifiquei que existem **apenas 2 triggers** no banco (ambos `update_updated_at_column`), então esses triggers nunca foram criados.

### ✅ O que está protegido

`workspace_secrets` — verifiquei diretamente: **RLS ligado**, 4 policies restringindo ao dono do workspace, coluna `key_value` presente.

> **Correção de dois achados de subagente:** o lote de Integrações reportou (a) que `workspace_secrets.key_value` havia sido dropada e (b) uma policy órfã que deixaria a tabela permissiva. **Nenhum dos dois se confirma em produção.** A coluna existe e a única policy de `SELECT` é restrita ao dono. O que existe de real é um descompasso de tipos: `src/integrations/supabase/types.ts:13673` declara `encrypted_value` e não `key_value` — então o código TypeScript aponta para uma coluna que o banco não tem, sob esse nome. O efeito prático sobre as integrações é o mesmo relatado, mas a causa é outra e a correção também.

---

## 5. Dado fictício em produção

Procurei ativamente. Estes são os casos onde o sistema **mostra número inventado como se fosse medição**:

### 5.1 Grava dado fabricado no banco real — o mais grave

`src/pages/PromptExperimentsPage.tsx:205-220` — o botão "simular" grava **50 execuções geradas com `Math.random()`** na tabela de runs de experimento, com viés deliberado para a variante B (`quality_score` +0.08, `success` 0.92 vs 0.85). É dado sintético contaminando a base que decide vencedor de A/B test.

### 5.2 Telas que fingem dado

| Local                                      | O que finge                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `knowledge/RealtimeVectorCharts.tsx:22,32` | Gráficos hardcoded com badge **"Live"** e spinner animado                                                                            |
| `knowledge/IngestionLogsPanel.tsx:26`      | `mockLogs` com "Processando 22/42 chunks…"                                                                                           |
| `knowledge/VectorSearchResults.tsx:25`     | 3 chunks inventados citando PDFs inexistentes                                                                                        |
| `security/GuardrailsSimulator.tsx:25-53`   | Keyword-match no cliente devolvendo `model: 'guardrails-ml-v2.2', confidence: 0.95`. A edge function real existe e **não é chamada** |
| `security/ComplianceFrameworks.tsx:14-27`  | LGPD/SOC2/GDPR/ISO por fórmula arbitrária (`postureScore + 10`). Pode exibir "Conforme" sem um controle mapeado                      |
| `deployments/DeploymentWizard.tsx:28-34`   | `setTimeout(2000)` + toast "Agente implantado em PRODUCTION". O consumidor só faz `logger.info`                                      |
| `agents/…/DeployModule.tsx:270-278`        | "Saúde da Infraestrutura": "124ms (Healthy)", "2 nodes active", "85% Capacity" — literais                                            |
| `settings/HuggingFaceTab.tsx:3-10`         | 7 features com selo verde "Ativo" sem verificação; claim "99.9% precisão"                                                            |
| `pages/DeploymentsPage.tsx:195-196`        | Uptime `'99.99%'` literal; latência com fallback `142ms` exibido em verde                                                            |
| `computer-use-execute/index.ts:87-120`     | Teatro completo: dorme 1500ms e devolve **uma foto do Unsplash como "screenshot"**                                                   |
| `notification-sender/index.ts:185-193`     | Retorna `{success:true}` sem enviar e-mail                                                                                           |

### 5.3 Bug que zera métrica de segurança

`services/securityService.ts:371-398` faz `.select('action')` mas lê `r.endpoint` e `r.blocked` — campos nunca selecionados. Pior: `endpoint` **nem existe** em `audit_log` (confirmei as 10 colunas). "LLM Calls", "File Uploads" e "Blocked" são **zero permanente**, mesmo com tráfego real.

### 5.4 "IA" que é `if/includes`

`CreateAgentWizard.tsx:140-207` — a criação mágica de agente. O comentário no próprio código: _"In a real app, this would call an AI endpoint. For now, we simulate with a more robust logic."_ Mais 3 features rotuladas "IA" com o mesmo padrão.

---

## 6. A suíte de testes mede laços, não proteção

`tsc --noEmit` sai limpo e **6.222 testes passam — isso eu executei**. Mas:

| Achado                                                                      | Medição                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Testes que protegem lógica real                                             | **~2.794 de 6.222 (44,9%)**                                             |
| Um único arquivo produz                                                     | **3.272 testes = 52,6% da suíte** (`regression-ui-invariants.test.tsx`) |
| Destes, produto cartesiano `6 arquivos × 17 cores × 10 shades × 3 prefixos` | **3.060** asserções de ausência de string que o ESLint já reprova       |
| Testes escritos e **nunca executados** por nenhum pipeline                  | **126** (RLS: 8; `tests/e2e`: 4; Deno: 114)                             |

**Por que `tsc` passar não significa nada aqui:** `types.ts` **é** o contrato do TypeScript, e ele declara 276 tabelas e 119 RPCs. O compilador valida contra a ficção, não contra o banco. As 98 RPCs inexistentes são chamadas com tipo perfeitamente válido.

### 6.1 Gates de CI que não podem reprovar

| Gate                  | Problema                                                                                                                                                                           | Evidência                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Regressão visual      | Roda `--update-snapshots` **antes** de comparar — estruturalmente incapaz de falhar                                                                                                | `ci.yml:132-135`          |
| CodeQL                | `continue-on-error: true` + upload desabilitado — roda 30 min e descarta                                                                                                           | `codeql.yml:14`           |
| Teste de RLS          | Script existe em `package.json:19`, **zero invocações** em `.github/`                                                                                                              | verificado                |
| `tests/e2e/`          | `playwright.config.ts:4` aponta `testDir: './e2e'` — o diretório é órfão                                                                                                           | verificado                |
| Carga (k6)            | Sem service-role key faz `sleep(1); return;` — zero requisições, thresholds vazios passam                                                                                          | `llm-gateway.k6.js:64-67` |
| Plugin `nexus-design` | `RuleTester` do ESLint 9 dentro do vitest **não executa asserção nenhuma** — provado experimentalmente com fixture impossível (999 erros esperados) que passou. É gate obrigatório | `ci.yml:53`               |

Observação sobre o histórico: o commit `5875f6d` — _"fix(e2e): refresh visual baselines on CI before comparison"_ — foi exatamente o que cegou a regressão visual, para deixar o CI verde.

**Não há job de deploy.** As 86 edge functions são validadas a cada PR e não têm publicação automatizada; `scripts/deploy-edge-functions.sh` não é referenciado por nada.

---

## 7. O que está bom

Não vou distorcer o quadro para parecer rigoroso. Isto é sólido:

- **A camada de services é de qualidade alta.** 166 arquivos, **zero** métodos stub, zero `not implemented`, zero store em memória fingindo persistência. Algoritmos reais: Jaccard, diff LCS, parser de cron próprio, circuit breaker, E2EE com WebCrypto.
- **Navegação íntegra:** 110 de 110 itens de menu têm rota. Apenas **1** página órfã em 141 (`Index.tsx`).
- **Chat com agente funciona de verdade** — SSE contra `llm-gateway`, com persistência (`ChatWithAgentPage.tsx:257`).
- **Oráculo chama LLM real** (OpenAI/Anthropic/Google via gateway).
- **A verificação HMAC dos webhooks é excelente** — constant-time, janela de replay, dedupe, DLQ, circuit breaker. Está pronta e apenas inalcançável por falta de 5 linhas de config.
- **`skill-classifier-parity.test.ts`** — 416 testes travando a paridade app ⟷ Deno contra drift. Esse é o tipo de teste que protege.
- **Higiene de segredos boa:** nenhuma chave de API real commitada.
- **Núcleo do modelo de dados correto:** `agents` tem 18 colunas e RLS ligado; `workspace_secrets` protegido.
- **i18n simétrico:** 332 chaves pt-BR / 332 en-US.

---

## 8. Código morto — com prova de ausência de chamador

| Escopo                      | Órfãos                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Páginas                     | 1 (`Index.tsx`)                                                                                                                                         |
| Services                    | 5 (`riskService`, `fineTuningService`, `agentEvolutionService`, `middlewarePipelineService`, `skillsSimulationService`)                                 |
| Edge Functions              | 3 (`pg-net-smoke-test`, `slack-agent-notify`, `whatsapp-router`)                                                                                        |
| Componentes                 | ~30, incluindo `WorkflowTimeTravelPanel` (712 l.), `curatedSkills.ts` (789 l.), `sandbox/` inteiro, `super-cerebro/tabs/` inteiro, 14 primitivos shadcn |
| **Linhas mortas estimadas** | **~4.000**                                                                                                                                              |

**Ressalva metodológica:** dois falsos positivos foram descartados durante a auditoria (`KeyboardShortcutsDialog` e `OnboardingTour` são carregados via `lazyWithRetry` em `AppLayout.tsx:52-53`). Antes de apagar qualquer coisa desta lista, repita a busca — regex de detecção erra com import dinâmico e genéricos.

---

## 9. Refactors abandonados

Onde o módulo novo foi criado e **o antigo é o que roda**:

1. `riskService` (0 importadores) vs `RiskRegisterPage.tsx:76` (query direta) — **a query direta é o que executa**
2. `budgetService` vs `BudgetsPage.tsx:99` — consultam `budget_events` independentemente
3. `middlewarePipelineService` (397 linhas + testes) vs `MiddlewarePipelinePanel.tsx:10-16` — o painel afirma no docstring que "wires" o service e **não o importa**; renderiza array fixo
4. **Client dual** — `supabase` (auth), `supabaseExternal` (dados) e o helper `fromTable` convivem no mesmo arquivo (`monitoringService.ts:107,114,116,148,150`). O "banco externo" foi abandonado; `.env.example:10,19` aponta ambos para o mesmo projeto

Além disso, **36 tabelas** são acessadas tanto por service quanto direto de `.tsx` — a camada de serviço nunca foi adotada por completo.

---

## 10. O universo de intenções — prometido, planejado e sugerido

61 documentos lidos. O catálogo completo, item a item com `arquivo:linha`, está no documento de detalhe.

| Categoria                                                                             |                          Itens |
| ------------------------------------------------------------------------------------- | -----------------------------: |
| **Prometido como pronto** (algum documento afirma estar implementado)                 |                         **78** |
| **Planejado** (roadmap, backlog, fases futuras)                                       | **56** + 29 agentes de negócio |
| **Sugerido e nunca decidido** (recomendação de gap-analysis sem aprovação nem recusa) |                         **43** |
| **Explicitamente fora de escopo**                                                     |                         **19** |

### 10.1 Afirmações numéricas dos documentos, testadas uma a uma

**128 afirmações catalogadas: 74 DESMENTIDAS, 9 CONFIRMADAS, 45 não verificáveis.**

| Afirmação              | Onde                                                             |              Valor afirmado |                            Real |
| ---------------------- | ---------------------------------------------------------------- | --------------------------: | ------------------------------: |
| Tabelas com RLS        | `SECURITY.md:62`, `FUNCIONALIDADES-DO-SISTEMA.md:670` + 3 outros |                    **100%** |                **18% (39/215)** |
| Páginas                | `FUNCIONALIDADES-DO-SISTEMA.md`                                  |                          98 |                             141 |
| Edge Functions         | idem                                                             |                          63 |                              86 |
| Migrations             | idem                                                             |                          42 |                             326 |
| Testes                 | idem                                                             |                          83 | 6.222 (dos quais ~45% protegem) |
| Permissões RBAC        | idem                                                             |                       "37+" |    37 no código, **0 no banco** |
| Jobs `pg_cron` ativos  | 8 documentos de fase                                             | ~20 "✅ ativos e validados" |                           **0** |
| Production-Ready Score | `FUNCIONALIDADES-DO-SISTEMA.md:683`                              |                **10/10 ✅** |                               — |

Nota sobre `SECURITY.md:62`: afirma "RLS habilitada em 100% das tabelas públicas (**verificado por `supabase--linter` no CI**)". Não existe tal verificação em `.github/workflows/`. É uma política pública de segurança apoiada em um gate inexistente.

### 10.2 A armadilha de evidência fabricada mudou de camada

Esperava-se, pelo padrão conhecido, encontrar componentes de negócio citados como prova e inexistentes. **Isso não se confirma aqui** — e registro porque contraria a hipótese de partida. De ~180 nomes citados como evidência nos documentos, apenas **4 não existem**: `triggerEngineService`, o componente `GuardrailsPanel` (marcado ✅ em `BACKLOG-10-10.md:83`), `src/lib/middlewarePipelineService.ts` (caminho errado) e a tabela `forensic_snapshots` (usada por 3 arquivos, sem migration — confirmei ausente no banco).

Features de negócio têm tanto lastro quanto páginas administrativas. **A fabricação migrou para onde não aparece em `ls`:** 4 migrations citadas nominalmente que não existem, e ~20 jobs de cron declarados "validados". Ou seja — o que se inventa neste repositório é **trabalho do lado do banco**, exatamente a camada que esta auditoria descobriu não ter sido entregue.

### 10.3 Documentos por confiabilidade

| Documento                                                 | Veredito                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FUNCIONALIDADES-DO-SISTEMA.md`                           | **O mais enganoso.** Raiz, nome óbvio, 711 linhas, promete "mapeamento exaustivo". **8 das 10 linhas da tabela-âncora estão desmentidas.** A combinação "RLS 100%" + "10/10" + "Status produção: ✅ Aprovado" leva o leitor a concluir que pode publicar — com `anon` detendo CRUD irrestrito em `user_roles`, `credential_vault` e `api_keys` |
| `BACKLOG-10-10.md`                                        | 56/56 itens fechados ✅ no mesmo dia, incluindo um componente que não existe                                                                                                                                                                                                                                                                   |
| `docs/FASE8`–`FASE15`                                     | Descrevem um sistema de observabilidade auto-drenante que não roda (zero cron)                                                                                                                                                                                                                                                                 |
| `GAP-ANALYSIS-CLASSE-MUNDIAL-2026.md`                     | Órfão: 27 gaps, roadmap de 12 meses, zero citações posteriores. É a origem de quase toda a categoria "sugerido e nunca decidido"                                                                                                                                                                                                               |
| `docs/architecture/partitioning-assessment-2026-07-23.md` | **O mais honesto.** Único que registra "Linhas: 0" em 13 tabelas e decide adiar — bate com o fato medido                                                                                                                                                                                                                                       |

Os números de inventário erram **sempre para menos** (98 vs 141 páginas, 63 vs 86 functions, 42 vs 326 migrations): são fotos antigas nunca reconciliadas, não exagero deliberado.

---

## 11. O que esta auditoria NÃO cobriu

Declarado, não escondido.

- **Comportamento em navegador real.** Nada foi executado na aplicação; alcançabilidade veio de `App.tsx` e da cadeia de imports.
- **294 das 326 migrations** não foram lidas linha a linha — foram inventariadas por objeto (altitude declarada, conforme regra de fatiamento).
- **145 dos 189 arquivos de `src/test/`** foram cobertos por amostragem (~30 lidos integralmente).
- **60 dos 86 `index.ts` de edge functions** não foram lidos integralmente; suas colunas vêm de busca mecânica reproduzível e estão marcadas como tal no documento de detalhe.
- **Recontagem de cobertura (executada, não auto-relatada):** cruzei os nomes de arquivo citados nas 11 saídas contra a árvore real do repositório. **966 de 1.718 arquivos de código (56%) têm evidência citada nominalmente.** Os 752 restantes foram cobertos por varredura mecânica ou altitude declarada — não por citação individual. Concentração dos não-citados: `supabase/migrations` (292, altitude por desenho), `src/test` (140, amostragem declarada), `src/components/shared` (30), `src/components/ui` (28), `src/lib` (23). **Isto é uma lacuna real. Esta auditoria não tem cobertura nominal de 100%.**
- **Projetos Supabase externos** (Datahub) e **workers Cloudflare** de `agent.json`: sem acesso.
- **Env vars de produção das edge functions:** sem acesso. Não é possível afirmar quais segredos estão de fato configurados.
- **RLS por persona:** com o banco vazio, não é possível distinguir "nunca usado" de "bloqueado por policy".

---

## 12. Próximos passos

### 12.1 Barato e seguro — posso fazer sozinho

| #   | Ação                                                                                                                | Impacto                                               |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Renomear `20260332000001/2` para data válida (ex.: `20260401`)                                                      | Destrava as 2 maiores migrations pendentes            |
| 2   | Adicionar `[functions.bitrix24-webhook]` e `[functions.whatsapp-webhook]` com `verify_jwt = false` ao `config.toml` | 5 linhas — torna alcançáveis 2 integrações prontas    |
| 3   | Corrigir `securityService.ts:371-398` (selecionar as colunas que lê)                                                | 3 métricas de segurança deixam de ser zero permanente |
| 4   | Remover o botão "simular" de `PromptExperimentsPage.tsx:205`                                                        | Para de contaminar a base de A/B test                 |
| 5   | Remover `continue-on-error: true` do CodeQL; remover `--update-snapshots` do CI                                     | 2 gates voltam a poder reprovar                       |
| 6   | Adicionar `npm run test:rls` ao CI; corrigir `testDir` do Playwright                                                | 12 testes de isolamento passam a rodar                |
| 7   | Substituir mocks rotulados "Live"/"Ativo" por empty-state honesto                                                   | Para de exibir dado falso como medição                |

### 12.2 Toca produção — é decisão sua

| #   | Ação                                                                                                                | Por que exige sua decisão                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A   | **`REVOKE EXECUTE ON exec_sql FROM anon, authenticated`** (ou `DROP`)                                               | Fecha a execução de SQL arbitrário. Precisa confirmar que o gateway MCP de operação não depende dela em runtime |
| B   | **Ligar RLS nas 176 tabelas + revogar grants de escrita de `anon`** em `user_roles`, `credential_vault`, `api_keys` | É o conserto de segurança de maior impacto. Toca todo o banco                                                   |
| C   | Aplicar as 8 migrations pendentes                                                                                   | Restaura versionamento de agente, custo/uso, auditoria e índices de FK                                          |
| D   | Criar `trace_events` e as 98 RPCs ausentes                                                                          | Destrava observabilidade e o cluster GRC/SecOps de uma vez                                                      |
| E   | Regenerar `types.ts` a partir do banco real                                                                         | Faz o TypeScript voltar a proteger. Vai expor erros de compilação hoje ocultos — é o objetivo                   |
| F   | Adicionar `supabase db push` ao CI                                                                                  | Sem isso, o drift volta a crescer                                                                               |
| G   | Criar os 11 jobs `pg_cron` — 4 são de LGPD                                                                          | Automação de compliance está integralmente dormente                                                             |
| H   | Decidir sobre os 4 project IDs e corrigir as 3 migrations que apontam para o projeto errado                         | Requer saber quais projetos ainda existem                                                                       |

**Ordem que eu recomendo:** A e B primeiro (segurança, independem de roadmap), depois E (para enxergar o tamanho real do problema), depois C e D.

---

## 13. Documentos de detalhe

As tabelas de evidência completas, com `arquivo:linha` por funcionalidade, estão em `docs/auditoria-estado-2026-08/`:

| Documento                            | Escopo                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `01-frontend-paginas.md`             | 141 páginas, rotas, botões sem handler, dado mockado                                                              |
| `02-services.md`                     | 166 services, tabelas tocadas, RPCs ausentes, órfãos                                                              |
| `03-edge-functions.md`               | 86 edge functions, invocadores, segredos, auth, segurança                                                         |
| `04-camada-dados.md`                 | Reconciliação repo × banco, drift, migrations, GRANTs                                                             |
| `05-ui-agentes.md`                   | Agent Builder (19 abas), Super Cérebro, persistência                                                              |
| `06-componentes-a.md`                | skills, datahub, workflows, oracle, security, knowledge                                                           |
| `07-componentes-b.md`                | dashboards, métricas, crm, chat, billing, rbac, layout                                                            |
| `08-lib-hooks-rbac.md`               | RBAC, 2FA, autenticação, i18n, stores, órfãos                                                                     |
| `09-integracoes.md`                  | Bitrix24, Slack, WhatsApp, HF, LLMs, MCP, A2A                                                                     |
| `10-testes-e-ci.md`                  | Qualidade real dos 6.222 testes, gates de CI                                                                      |
| `11-intencoes-planejado-sugerido.md` | Catálogo de 78 prometidos / 56 planejados / 43 sugeridos / 19 fora de escopo, e 128 afirmações numéricas testadas |

**Aviso de leitura:** os documentos de detalhe são saídas de lotes independentes. Onde algum deles conflita com este documento executivo, **vale este** — as divergências foram reconciliadas contra o banco de produção e estão registradas como blocos de correção em §4.

---

## 14. Sobre a documentação existente

Todo documento anterior foi tratado como hipótese. Vários não sobreviveram ao teste — os números afirmados em `FUNCIONALIDADES-DO-SISTEMA.md` (V6, "10/10 production-ready") divergem do medido em quase todas as linhas. **Não corrigi nenhum desses arquivos** — a regra desta auditoria é não editar artefato de outra trilha. As divergências estão registradas no documento de detalhe de intenções.

**Recomendação:** `.lovable/memory/index.md` é o arquivo que todo agente lê primeiro, e ele instrui "Audit via RPC `log_audit_entry()`" — uma RPC que não existe. Enquanto não for corrigido, todo agente que trabalhar neste repositório vai repetir o mesmo erro.
