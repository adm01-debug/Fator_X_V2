# 05 — PROGRESSO

> Uma linha por etapa. O agente executor marca aqui, **na mesma PR da etapa**.

> `[ ]` não iniciada · `[x]` concluída e verificada · `[!]` aplicada, verificação não executada ·
> `[?]` PR aberta aguardando o dono · `[~]` não aplicada por código divergente

> Quando marcar `[x]`, cole a evidência indentada logo abaixo da linha. Quando marcar `[!]`, `[?]`
> ou `[~]`, escreva o motivo na mesma linha.

## Onda 1 — Segurança e risco de perda de dado

- [ ] **001** — Remover a edge function `migrate-helper` do projeto de produção — onda 1 — Crítica · **aprovação do dono**
- [ ] **002** — Rotacionar a `service_role` key e a senha do banco de produção — onda 1 — Crítica · **aprovação do dono**
- [ ] **003** — Apagar `migrate-helper` do repositório e do `config.toml` — onda 1 — Crítica
- [ ] **004** — Decidir a visibilidade do repositório e ligar as proteções de segredo — onda 1 — Crítica · **aprovação do dono**
- [ ] **005** — Varrer o histórico completo do Git em busca de outros segredos commitados — onda 1 — Crítica · **aprovação do dono**
- [ ] **006** — Definir o segredo dos jobs agendados **antes** de religar o JWT — onda 1 — Crítica · **aprovação do dono**
- [ ] **007** — Parar de deployar as 89 edge functions com `--no-verify-jwt` — onda 1 — Crítica · **aprovação do dono**
- [ ] **008** — `cron-executor`: exigir identidade do chamador (usuário **ou** cron) — onda 1 — Crítica
- [ ] **009** — `queue-worker`: exigir identidade do chamador (usuário **ou** cron) — onda 1 — Crítica
- [ ] **010** — `openclaw-proxy`: exigir JWT de usuário antes de gastar o token do OpenClaw — onda 1 — Crítica
- [ ] **011** — `a2a-server`: parar de inventar credencial e separar descoberta pública de execução de tarefa — onda 1 — Crítica · **aprovação do dono**
- [ ] **012** — `incident-orchestrator`: exigir identidade antes de pausar agentes de produção — onda 1 — Crítica
- [ ] **013** — `rag-embed-backfill`: validar segredo de serviço (é a **única** defesa possível aqui) — onda 1 — Crítica
- [ ] **014** — `validate-access`: o portão de IP/país que qualquer um atravessa e envenena — onda 1 — Crítica
- [ ] **015** — `synthetic-runner`: exigir identidade (usuário **ou** cron) antes de disparar as sondas — onda 1 — Crítica
- [ ] **016** — `slack-alert-dispatcher`: autenticar os dois chamadores (UI e trigger do banco) — onda 1 — Crítica · **aprovação do dono**
- [ ] **017** — `slack-dlq-retry`: autenticar o cron e o botão de reprocessamento — onda 1 — Crítica
- [ ] **018** — `slack-agent-notify`: **não tem chamador nenhum** — remover, ou fechar com segredo se o dono quiser mantê-la — onda 1 — Crítica · **aprovação do dono**
- [ ] **019** — `slack-rag-sync`: autenticar antes de copiar conversas de Slack para a base de conhecimento — onda 1 — Crítica
- [ ] **020** — `bitrix24-oauth`: autenticar `authorize` por JWT e amarrar o `callback` a um `state` assinado — onda 1 — Crítica · **aprovação do dono**
- [ ] **021** — `health-check`: exigir JWT e parar de usar `service_role` para um ping — onda 1 — Crítica
- [ ] **022** — `workflow-engine-v2`: parar de fabricar credencial `anon` quando o chamador não se identifica — onda 1 — Alta
- [ ] **023** — `agent-conversational-builder`: exigir JWT antes de chamar a OpenRouter — onda 1 — Alta
- [ ] **024** — `quick-agent-test`: exigir JWT antes de executar prompt arbitrário do chamador — onda 1 — Alta
- [ ] **025** — `skill-classify-llm`: **já autentica** — confirmar, corrigir a lista do achado e fechar o escopo de workspace — onda 1 — Alta
- [ ] **026** — `skill-describe-llm`: **já autentica** — mesma correção de registro e de escopo da 025 — onda 1 — Alta
- [ ] **027** — `cost-calculator`: exigir JWT — a `service_role` está aqui, escondida atrás de `createAdminClient()` — onda 1 — Crítica
- [ ] **028** — `geo-code`: **já autentica em cascata** — confirmar, corrigir o comentário mentiroso e decidir se a function tem dono — onda 1 — Alta · **aprovação do dono**
- [ ] **029** — `kb-analyze-gaps`: escopo de workspace (o resíduo que a etapa 034 **não** cobre) — onda 1 — Crítica
- [ ] **030** — `kb-translate-article`: escopo de workspace (o resíduo que a etapa 035 **não** cobre) — onda 1 — Crítica
- [ ] **031** — `visual-search`: mover o gate para antes da chamada de visão (o resíduo que a etapa 036 **não** cobre) — onda 1 — Alta
- [ ] **032** — Fazer o guard de CI validar o deploy real, não apenas a intenção declarada — onda 1 — Alta · **aprovação do dono**
- [ ] **033** — `llm-gateway`: negar por padrão quando não há workspace, em vez de liberar — onda 1 — Crítica
- [ ] **034** — `kb-analyze-gaps`: validar o token, não só a presença do header — onda 1 — Crítica
- [ ] **035** — `kb-translate-article`: mesma correção da 034 — onda 1 — Crítica
- [ ] **036** — Decidir, por teste, se `visual-search` é bypass de autorização ou feature morta — onda 1 — Alta
- [ ] **037** — `a2a-server`: recusar com 401 quando o chamador não manda credencial, em vez de inventar uma — onda 1 — Alta
- [ ] **038** — `cron-executor`: validar o destino antes de disparar a requisição com a chave do sistema — onda 1 — Alta · **aprovação do dono**
- [ ] **039** — `agent-conversational-builder`: autenticar e aplicar orçamento antes de gastar LLM — onda 1 — Crítica
- [ ] **040** — `kb-analyze-gaps`: rotear a chamada de LLM pelo `llm-gateway` — onda 1 — Crítica
- [ ] **041** — `kb-translate-article`: rotear a chamada de LLM pelo `llm-gateway` — onda 1 — Crítica
- [ ] **042** — `quick-agent-test`: autenticar e rotear a chamada de LLM pelo `llm-gateway` — onda 1 — Crítica
- [ ] **043** — `skill-classify-llm`: aplicar `check_budget` antes da chamada paga — onda 1 — Alta
- [ ] **044** — `skill-describe-llm`: aplicar `check_budget` antes da chamada paga — onda 1 — Alta
- [ ] **045** — `visual-search`: aplicar `check_budget` antes da chamada de visão — onda 1 — Crítica
- [ ] **046** — Gerar os códigos de recuperação do 2FA com `crypto.getRandomValues` — onda 1 — Alta
- [ ] **047** — Servir os três cabeçalhos de segurança como cabeçalho HTTP no Vite (dev e preview) — onda 1 — Alta
- [ ] **048** — `e2e/security.spec.ts`: verificar o cabeçalho em vigor, não o texto da meta tag — onda 1 — Alta
- [ ] **049** — Remover do `index.html` as três metas de segurança que o navegador ignora — onda 1 — Média
- [ ] **050** — Entregar a CSP também como cabeçalho, com `frame-ancestors 'none'` — onda 1 — Alta · **aprovação do dono**
- [ ] **051** — Corrigir a regra de alteração que deixa mover registro para o workspace de outro cliente — onda 1 — Crítica · **aprovação do dono**
- [ ] **052** — Corrigir a regra de inserção que permite gravar linha em nome de outra pessoa — onda 1 — Crítica · **aprovação do dono**
- [ ] **053** — Confirmar no banco se `public.exec_sql` ainda está acessível a `anon` — PRIMEIRA ação do executor — onda 1 — Crítica · **aprovação do dono**
- [ ] **054** — Criar o gate de dependências que separa runtime de dev e tem exceções versionadas — onda 1 — Alta
- [ ] **055** — Criar o caminho que atribui papel a um usuário — onda 1 — Alta · **aprovação do dono**
- [ ] **056** — Fazer o build falhar quando o código lê variável de ambiente que ninguém define — onda 1 — Alta · **aprovação do dono**
- [ ] **057** — Parar de gravar cabeçalho de requisição em `webhook_events` — onda 1 — Crítica
- [ ] **058** — Limpar os cabeçalhos com credencial já gravados em `webhook_events` — onda 1 — Crítica · **aprovação do dono**
- [ ] **059** — Trocar a policy `webhook_events_all` por isolamento de workspace — onda 1 — Crítica · **aprovação do dono**
- [ ] **060** — Trocar a policy `webhooks_all` e tirar o segredo do webhook de texto claro — onda 1 — Crítica · **aprovação do dono**
- [ ] **061** — Gerar segredo e path de webhook com gerador criptográfico — onda 1 — Alta
- [ ] **062** — Fazer o guard de drift também reprovar policy que não separa inquilino — onda 1 — Alta · **aprovação do dono**

## Achados novos (não corrigidos)

> Problema encontrado no caminho de uma etapa **não é corrigido na hora**. Anote aqui, com
> `arquivo:linha` e uma frase. O dono decide.

_(vazio no início)_
