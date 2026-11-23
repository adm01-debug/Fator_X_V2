# 04 — PLANO DE CORREÇÃO EM 300 ETAPAS

> Commit de referência: `d912348`. Cada etapa é uma mudança atômica, que cabe em uma PR pequena e
> pode ser verificada sozinha. As ondas estão em ordem de prioridade; dentro de cada onda, as
> dependências mandam.

## Instruções para o agente executor

Você vai executar este plano sozinho. Quem o escreveu não está disponível, e esta conversa não existe mais.
Tudo o que você precisa está neste arquivo e nos quatro arquivos vizinhos em `docs/qa/`.

### Antes da primeira etapa — leia nesta ordem

1. `docs/qa/00-RESUMO.md` — o que está em jogo, em linguagem de negócio.
2. `AGENTS.md` na raiz — as regras do dono (fluxo git, banco, deploy, comunicação). **Elas valem acima deste plano.**
3. `docs/qa/03-ACHADOS.md` — os achados que as etapas resolvem.
4. A seção **"Estado medido em 2026-11-23"** no fim deste arquivo — a lista de fatos que foram verificados
   nesta auditoria, com o comando que os produziu. É o seu ponto de partida; não confie em nenhum outro
   documento do repositório sobre esses pontos (vários estão desatualizados — ver `03-ACHADOS.md`, achado DOC-01).

### As sete regras do ciclo de uma etapa

**1. Uma etapa por vez, na ordem, respeitando `Depende de`.**
Não agrupe etapas "porque são parecidas". Não pule para a Onda 3 porque a Onda 1 está difícil. Se uma etapa
está bloqueada por dependência não concluída, vá para a próxima etapa **independente** e registre o desvio em
`docs/qa/05-PROGRESSO.md`.

**2. Antes de mudar qualquer coisa, releia a evidência da etapa no código atual.**
Cada etapa cita `arquivo:linha`. Abra e confirme que o que está escrito ainda é verdade. O repositório tem
vários agentes trabalhando nele; o código pode ter mudado depois desta auditoria.

- Se o código **já não corresponde**: **pare a etapa**. Escreva em `05-PROGRESSO.md`:
  `[~] NNN — código divergente: <o que você encontrou no lugar> — não aplicado`. Vá para a próxima etapa independente.
- Se o problema **já foi corrigido** por outra pessoa: marque `[x] NNN — já corrigido por <commit>` e siga.
- **Nunca** "adapte" a etapa a um código diferente do descrito sem registrar isso. Uma etapa aplicada no lugar
  errado é pior do que uma etapa não aplicada.

**3. Corrija a causa raiz com a menor mudança possível.**
O campo `Caminho recomendado` existe porque quem auditou viu o repositório inteiro e você está vendo um arquivo.
Ele diz por onde começar, qual padrão já existente no repositório seguir (com o arquivo de referência) e qual
atalho tentador evitar. **Siga-o.** Se discordar, registre a divergência e o motivo em `05-PROGRESSO.md` antes
de fazer diferente.
Não refatore, não renomeie, não reorganize imports, não "melhore" o que a etapa não pede. Não reescreva um
arquivo inteiro para mudar três linhas.

**4. Problema novo encontrado no caminho não é corrigido na hora.**
Anote no fim de `05-PROGRESSO.md`, na seção `## Achados novos (não corrigidos)`, com `arquivo:linha` e uma
frase. O dono decide. "Aproveitei e também consertei X" é proibido: contamina o diff e impede saber o que
causou o quê.

**5. Etapa com `Precisa de aprovação humana: sim` → abra a PR e pare.**
Não mergeie. Escreva no corpo da PR, no topo: `⚠️ Aguardando aprovação do dono — etapa NNN`. Marque em
`05-PROGRESSO.md` como `[?] NNN — PR aberta aguardando o dono: <link>`. Siga para a próxima etapa independente.
Isso vale para migration/DDL em produção, `.github/workflows/`, segredos, infraestrutura, deleção de dado,
mudança de arquitetura e mudança de custo.

**6. Uma etapa só está concluída com a verificação executada e a evidência anotada.**
O campo `Como verificar` traz um comando, consulta ou request concreto e o resultado esperado. Rode. Cole a
saída real (recortada no que importa) em `05-PROGRESSO.md`.
**"Deveria funcionar" não conclui etapa. "O código está correto" não conclui etapa. "Os testes passam" só
conclui etapa se a verificação da etapa for exatamente os testes.**
Se a verificação não puder ser executada (falta acesso ao banco, falta credencial, serviço fora), marque
`[!] NNN — aplicado, verificação não executada: <motivo exato>`. Nunca marque `[x]`.

**7. Fluxo git, por etapa.**
Uma etapa = uma branch = uma PR. Branch a partir de `main` atualizado, nomeada
`claude/<fix|feat|chore|ci>-<slug>-<AAMMDD-HHMM>`. Commit em PT-BR, Conventional Commits, de preferência um só.
Antes do push, confirme que o último commit da branch é seu. Nunca commite em `main`. Nunca escreva em branch
que você não criou. Se houver PR aberta de outro agente tocando os mesmos arquivos, **pare e avise o dono**.
Detalhe completo em `AGENTS.md` → "Fluxo Git" e `docs/agentes/github-ci.md`.

### Três coisas específicas deste repositório que vão te morder

**a) Mergear não publica o front-end.** Medido nesta auditoria: o HTML servido em produção
(`https://superagent-lab.lovable.app`) é de um build anterior a 2026-11-11. A Vercel tem **zero projetos**.
O Lovable publica por botão manual. Portanto: depois de mergear uma correção de front, **você não pode dizer
que está em produção**. Marque `[!]` com `deploy do front não confirmado — publicação é manual no Lovable` e
avise o dono. Detalhe no achado DEPLOY-01.
**Edge functions, ao contrário, sobem automaticamente** no merge em `main` que toque `supabase/functions/**`
(`.github/workflows/edge-deploy.yml`) — então mudança em edge **vai para produção no merge**. Trate com o
cuidado correspondente.

**b) O banco de produção pode não estar acessível para você.** Nesta sessão de auditoria não havia MCP
apontando para `qdlnzopxrlsoljcrcmzv`. Se você também não tiver, **diga que não consegue ler o banco** em vez
de inferir — e marque as etapas de banco como `[!]`. Existe um caminho: o secret `DB_MCP_URL` do repositório
aponta para um MCP chamado `supabase-fatorx-v2-mcp` e o job `DB Drift Check` o usa com sucesso
(`.github/workflows/ci.yml:33-47`). Para ler o banco você pode disparar um workflow que rode uma consulta de
leitura por esse MCP — **nunca** cole credencial em código ou em resposta.

**c) Religar `verify_jwt` nas edge functions quebra os jobs agendados.** Três migrations montam a chamada
agendada com `'Bearer ' || current_setting('app.settings.service_role_key', true)` e **nenhuma migration
define esse GUC** — então o header vai vazio e só funciona porque hoje o JWT está desligado em todas as
functions. A ordem obrigatória está nas etapas da Onda 1; não invente outra. Detalhe no achado CRON-01.

### Como marcar o progresso

`docs/qa/05-PROGRESSO.md` tem uma linha por etapa. Marque com:

- `[x]` concluída e verificada (com a evidência logo abaixo, indentada)
- `[!]` aplicada, verificação não executada (com o motivo)
- `[?]` PR aberta aguardando o dono
- `[~]` não aplicada por código divergente (com o que você encontrou)
- `[ ]` ainda não iniciada

Atualize o arquivo **na mesma PR da etapa**. Um plano sem progresso registrado é um plano que ninguém sabe onde parou.

### O que fazer quando o plano estiver errado

Este plano foi escrito a partir do código em `d912348` (2026-11-21), com o banco de produção **inacessível** e
sem credencial de usuário para testar a área logada. Há etapas marcadas `HIPÓTESE` e achados marcados
`NÃO VERIFICADO` — eles dizem o que faltou para confirmar. Ao chegar numa dessas, **primeiro confirme, depois
corrija**. Se a confirmação mostrar que o achado não existe, feche a etapa como
`[~] NNN — achado não se confirma: <evidência>` e siga. Isso é sucesso, não falha: o plano previu a dúvida.

---

## Onda 1 — Segurança e risco de perda de dado (etapas 001–062)

### Etapa 001 — Remover a edge function `migrate-helper` do projeto de produção

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge functions) + Infraestrutura
**Achados resolvidos:** SEC-01

**Problema hoje:** `supabase/functions/migrate-helper/index.ts` está publicada em produção e, para quem
enviar o header `x-access-key` com a chave que está na linha 5 do próprio arquivo, devolve em JSON a
`SUPABASE_SERVICE_ROLE_KEY` e a `SUPABASE_DB_URL` do projeto `qdlnzopxrlsoljcrcmzv`
(`supabase/functions/migrate-helper/index.ts:30-38`). Não exige JWT (`supabase/config.toml:15-16`) e o CORS é
`*` (`:6-10`). O repositório é **público** (`github_get_repo` → `"private": false`), então a chave é legível
por qualquer pessoa. Está no ar: o log do job 136961936305 (workflow `Edge Deploy`, run 44942293262, commit
`d912348`, 2026-11-21) registra `Deploying Function: migrate-helper` e
`Deployed Functions on project qdlnzopxrlsoljcrcmzv: migrate-helper`, fechando com
`✅ Deployed: 89 | ❌ Failed: 0`. O comentário das linhas 1-3 do próprio arquivo diz
"Edge function temporária para migração de banco. Após a migração, remova esta função."

**Causa raiz:** uma função de administração criada para um mutirão de migração foi commitada com a credencial
embutida e nunca removida — nem do repositório nem do projeto. O deploy automático de todas as functions
(`.github/workflows/edge-deploy.yml`) a republica a cada push que toque `supabase/functions/**`.

**Caminho recomendado:**

1. **Primeiro remova de produção, depois do repositório.** Esta é a ordem que importa: apagar o arquivo e
   mergear **não** remove a function já publicada — o `supabase functions deploy` só cria e atualiza, nunca
   apaga o que saiu do diretório. Se você inverter, o arquivo desaparece do Git e a function continua
   respondendo, e ninguém mais lembra que ela existe.
2. Remova pelo painel (Supabase → projeto `qdlnzopxrlsoljcrcmzv` → Edge Functions → `migrate-helper` →
   Delete) ou por CLI com o `SUPABASE_ACCESS_TOKEN`:
   `npx supabase functions delete migrate-helper --project-ref qdlnzopxrlsoljcrcmzv`.
3. **Não** tente "consertar" a função trocando a chave por um secret ou adicionando autenticação. Ela não tem
   uso legítimo hoje: o `action=ping` só devolve a URL do projeto e o `action=credentials` existe para vazar
   credencial. O caminho de ler o banco com privilégio já existe e é o `DB_MCP_URL` usado pelo
   `DB Drift Check` (`.github/workflows/ci.yml:33-47`).

**Arquivos e objetos a tocar:** nenhum arquivo nesta etapa. Objeto: a Edge Function `migrate-helper` no
projeto `qdlnzopxrlsoljcrcmzv`.

**Não tocar / armadilhas:** não remova ainda o arquivo do repositório nem a entrada do `config.toml` — isso é
a etapa 003, e fazer agora faria o próximo push republicar a função antes de você apagá-la. Não mexa em
nenhuma outra function nesta etapa. Não rode `scripts/deploy-edge-functions.sh` depois de apagar: ele
republica tudo o que estiver no diretório, inclusive a `migrate-helper`, se o arquivo ainda existir.

**Depende de:** — · **Libera:** 002, 003

**Risco e como reverter:** risco de quebrar algo é praticamente nulo — nenhum arquivo de `src/` ou de
`supabase/functions/` chama `migrate-helper` (`grep -rn "migrate-helper" src/ supabase/functions/` só retorna
a própria pasta e o `config.toml`). Reverter seria republicar a função, o que **não se deve fazer**.

**Precisa de aprovação humana antes do merge:** **sim** — operação em infraestrutura de produção (remoção de
function publicada).

**Como verificar:**
`npx supabase functions list --project-ref qdlnzopxrlsoljcrcmzv` → `migrate-helper` **não** aparece na lista.
Se não houver CLI disponível, confirme pelo painel. Registre a saída no progresso.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica (a remoção É a operação de produção)
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 002 — Rotacionar a `service_role` key e a senha do banco de produção

**Onda / Severidade / Camada:** 1 / **Crítica** / Infraestrutura + Segredos
**Achados resolvidos:** SEC-01

**Problema hoje:** a `SUPABASE_SERVICE_ROLE_KEY` e a `SUPABASE_DB_URL` do projeto `qdlnzopxrlsoljcrcmzv`
estiveram obteníveis por qualquer pessoa na internet pelo endpoint da etapa 001, com a chave de acesso
publicada em repositório público. Apagar a função (001) fecha a porta, **mas não invalida o que já pode ter
sido copiado**. Não há como saber se foi: o repositório está público desde 2026-05-11
(`github_get_repo` → `created_at`), o secret scanning está **desligado**
(`security_and_analysis.secret_scanning.status: "disabled"`) e `audit_log` não pôde ser consultado nesta
sessão. **Trate as duas credenciais como vazadas.**

**Causa raiz:** a mesma da 001. Esta etapa existe porque remoção de exposição e rotação de credencial são
duas coisas diferentes, e só a segunda fecha o risco retroativo.

**Caminho recomendado:**

1. Supabase → projeto → Settings → API → **Reset** da `service_role` key; e Settings → Database → **Reset
   database password**.
2. **Antes de rodar o reset, liste onde as duas credenciais são consumidas**, porque o reset derruba tudo o
   que usa a antiga, de uma vez:
   - secrets do GitHub Actions: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
     (`github_list_actions_secrets`, EXECUTADO) — usados por `ci.yml:139-143` (E2E) e `ci.yml:267-269` (k6);
   - secrets de runtime das edge functions (painel do Supabase): `SUPABASE_SERVICE_ROLE_KEY` é injetada
     automaticamente pela plataforma, então **não** precisa de ação manual nas 41 functions que a leem;
   - `DB_MCP_URL` (secret do GitHub): se a URL carregar credencial do banco, precisa ser regerada junto;
   - ambiente do Lovable (produção do front): usa a chave **publishable/anon**, não a `service_role` — a
     rotação da `service_role` **não** derruba o front.
3. Atualize os secrets do GitHub com os valores novos, pelo painel do repositório. **Nunca** cole o valor em
   código, em commit, em corpo de PR ou em resposta de chat.
4. Depois do reset, dispare manualmente o `Edge Deploy` (`workflow_dispatch`) para garantir que as functions
   peguem a credencial nova, e rode o `Nexus CI` para confirmar que o `DB Drift Check` ainda conecta.

**Arquivos e objetos a tocar:** nenhum arquivo. Objetos: chave `service_role` e senha do banco do projeto
`qdlnzopxrlsoljcrcmzv`; secrets do GitHub `SUPABASE_SERVICE_ROLE_KEY` e, se aplicável, `DB_MCP_URL`.

**Não tocar / armadilhas:** **não rotacione a chave `anon`/publishable nesta etapa.** Ela está embutida em
duas migrations já aplicadas (`supabase/migrations/20261120162913_fix_exfil_trigger_urls.sql:28` e
`20260722112903_…sql`) dentro de funções `SECURITY DEFINER` que postam alerta de segurança no Slack; rotacionar
a `anon` **sem antes** corrigir essas funções faz os alertas pararem de chegar em silêncio (não há tratamento
de erro no `http_post`). Isso é a etapa 046. Também não mexa nas migrations nesta etapa.

**Depende de:** 001 · **Libera:** 004

**Risco e como reverter:** risco real de indisponibilidade momentânea: qualquer consumidor que não for
atualizado passa a receber 401. Não há "reverter" — a chave antiga não volta. Por isso o passo 2 vem antes do
passo 1 na prática: levante os consumidores, depois rotacione.

**Precisa de aprovação humana antes do merge:** **sim** — rotação de segredo de produção.

**Como verificar:**
(a) Dispare o `Nexus CI` e confirme no log do job `DB Drift Check` a linha
`MCP conectado: supabase-fatorx-v2-mcp` seguida de `✅ Banco sincronizado…` — prova que a credencial nova
funciona. (b) Confirme no painel do Supabase que a data de criação da `service_role` key é de hoje.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 003 — Apagar `migrate-helper` do repositório e do `config.toml`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge functions)
**Achados resolvidos:** SEC-01

**Problema hoje:** mesmo depois de removida de produção, a pasta
`supabase/functions/migrate-helper/` continua no repositório público com a chave na linha 5, e
`supabase/config.toml:15-16` ainda a declara com `verify_jwt = false`. Qualquer push que toque
`supabase/functions/**` a **republica**, porque `scripts/deploy-edge-functions.sh:18-23` itera sobre todas as
pastas do diretório.

**Causa raiz:** a mesma da 001; esta etapa fecha o caminho de retorno.

**Caminho recomendado:**

1. Apague a pasta `supabase/functions/migrate-helper/` inteira e remova o bloco
   `[functions.migrate-helper] verify_jwt = false` de `supabase/config.toml` (linhas 15-16, junto com a linha
   em branco).
2. Regenere o manifest de deploy: `node scripts/edge-deploy/generate-manifest.mjs`. **Isto é obrigatório** —
   `.github/workflows/guards.yml:125` roda esse script com `--check` e o job fica vermelho se
   `supabase/deployment-manifest.json` não bater com o diretório.
3. Use o MCP `GITHUB - MCP - FOREVER` (`github_push_files` aceita `files` + `delete` no mesmo commit) para o
   commit, conforme `AGENTS.md`.
4. **Não** apenas comente o código nem renomeie a chave para um placeholder: a chave continua no histórico do
   Git de um repositório público. A remoção do arquivo é higiene; o que fecha o risco é a rotação da etapa 002,
   que já foi feita. Não tente reescrever o histórico (`filter-repo`/`force-push`): a `main` tem
   `allow_force_pushes: false` e histórico linear exigido.

**Arquivos e objetos a tocar:** `supabase/functions/migrate-helper/index.ts` (apagar), `supabase/config.toml`,
`supabase/deployment-manifest.json` (regenerado).

**Não tocar / armadilhas:** não altere os outros 8 blocos `verify_jwt = false` do `config.toml` — os webhooks
precisam deles (os 5 receptores autenticam por HMAC, não por JWT; verificado). Não edite o
`deployment-manifest.json` à mão: ele tem `manifest_sha256` e o guard recalcula.

**Depende de:** 001, 002 · **Libera:** 006

**Risco e como reverter:** baixo. Nada no código chama `migrate-helper`. Reverter = `git revert` da PR.

**Precisa de aprovação humana antes do merge:** **não** — é remoção de código morto; a parte de
infraestrutura já foi aprovada nas etapas 001 e 002.

**Como verificar:**

```bash
test ! -d supabase/functions/migrate-helper && echo "pasta removida"
grep -c "migrate-helper" supabase/config.toml   # esperado: 0
node scripts/edge-deploy/generate-manifest.mjs --check && echo "manifest OK"
```

E, depois do merge, confirme no run do `Edge Deploy` que o total caiu para `✅ Deployed: 88`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 004 — Decidir a visibilidade do repositório e ligar as proteções de segredo

**Onda / Severidade / Camada:** 1 / **Crítica** / Infraestrutura (GitHub)
**Achados resolvidos:** SEC-01, SEC-SCAN-01

**Problema hoje:** `github_get_repo` devolve, para `adm01-debug/Fator_X_V2`:
`"private": false`, `"visibility": "public"`, `allow_forking: true`, e
`secret_scanning: disabled`, `secret_scanning_push_protection: disabled`,
`dependabot_security_updates: disabled`. O `AGENTS.md` afirma, por escrito, que o repositório é
"**privado**" — e toda a postura de segurança do projeto foi escrita sob essa premissa falsa. Foi isso que
transformou a chave da etapa 001 de "problema interno" em "credencial de produção publicada na internet".

**Causa raiz:** premissa errada sobre a visibilidade, nunca conferida, somada às proteções da plataforma
desligadas — nada barrou o commit da credencial.

**Caminho recomendado:**

1. **A decisão de tornar privado é do dono** (pode haver motivo deliberado: portfólio, Lovable, etc.). Pergunte
   em uma linha. Enquanto ele não responde, execute o passo 2, que vale nos dois cenários.
2. Ligue, independentemente da visibilidade: **Secret scanning**, **Push protection** e **Dependabot security
   updates** (Settings → Code security). Push protection é o que impede o próximo commit de credencial.
3. Se o dono optar por manter público: registre no `AGENTS.md` que é público (etapa 060) e trate a varredura
   de histórico (etapa 005) como obrigatória.
4. Se optar por privar: isso **não** desfaz a exposição passada — a rotação da etapa 002 continua sendo o que
   fecha o risco.

**Arquivos e objetos a tocar:** nenhum arquivo. Configuração do repositório no GitHub.

**Não tocar / armadilhas:** tornar o repositório privado **quebra o Lovable** se a integração dele depender de
acesso público ao repositório — confirme antes com o dono. Ligar push protection pode bloquear pushes
legítimos de outros agentes que contenham padrões parecidos com segredo; avise.

**Depende de:** 002 · **Libera:** 005, 060

**Risco e como reverter:** reversível pelo próprio painel.

**Precisa de aprovação humana antes do merge:** **sim** — mudança de visibilidade e de configuração de
segurança do repositório.

**Como verificar:**
`github_get_repo owner=adm01-debug repo=Fator_X_V2` → conferir
`security_and_analysis.secret_scanning.status == "enabled"` e
`secret_scanning_push_protection.status == "enabled"`; e `private` com o valor que o dono escolheu.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 005 — Varrer o histórico completo do Git em busca de outros segredos commitados

**Onda / Severidade / Camada:** 1 / **Crítica** / Segurança
**Achados resolvidos:** SEC-01, AUDIT-GAP-01

**Problema hoje:** **esta auditoria não conseguiu fazer essa varredura.** O clone da sessão era raso —
`.git/shallow` presente e `git rev-list --count HEAD` = **50** commits, o mais antigo `f618216` de 2026-11-13
(EXECUTADO). No HEAD, a varredura foi feita e só encontrou a chave da etapa 001. Mas o repositório é público
desde 2026-05-11, e **nada se sabe sobre os commits anteriores a 2026-11-13**. Com secret scanning desligado
esse tempo todo, nenhuma credencial commitada e depois removida teria sido detectada.

**Causa raiz:** não é um defeito de código — é um ponto cego de auditoria que precisa ser fechado antes de se
afirmar que o repositório está limpo.

**Caminho recomendado:**

1. Clone completo, fora do diretório de trabalho: `git clone --no-single-branch <url> /tmp/fx-full`
   (sem `--depth`), e confirme com `git rev-list --count --all`.
2. Varra o histórico inteiro com uma ferramenta própria para isso — `gitleaks detect --no-git=false` ou
   `trufflehog git file:///tmp/fx-full`. **Não** faça isso com `grep` por conta própria: os dois reconhecem
   formato de credencial de dezenas de provedores e você só precisa triar o resultado.
3. Para cada achado: registre **local e tipo**, **nunca o valor**, e trate cada um como vazado (rotacionar).
4. Alternativa, se o secret scanning tiver sido ligado na etapa 004: o GitHub varre o histórico sozinho e
   publica os alertas — aí basta ler `github_list_secret_scanning_alerts`. **Esse é o caminho mais barato;
   tente ele primeiro.**

**Arquivos e objetos a tocar:** nenhum no repositório. Produz um relatório em `docs/qa/` ou um comentário
para o dono.

**Não tocar / armadilhas:** **não reescreva o histórico.** `git filter-repo`/`filter-branch` em repositório
público não apaga nada de verdade (forks, caches, archives da API mantêm cópia) e a `main` tem
`allow_force_pushes: false` e `required_linear_history: true`. A correção para segredo histórico é
**rotação**, não reescrita.

**Depende de:** 004 · **Libera:** —

**Risco e como reverter:** nenhum — é leitura.

**Precisa de aprovação humana antes do merge:** **não** para a varredura em si; **sim** para qualquer rotação
de credencial que ela revele (abra uma etapa nova nesse caso).

**Como verificar:**
`github_list_secret_scanning_alerts owner=adm01-debug repo=Fator_X_V2 state=open` → deixa de devolver
`404 "Secret scanning is disabled"` e passa a devolver uma lista. Ou: a saída do `gitleaks`/`trufflehog`
anexada ao progresso, com os valores redigidos.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 006 — Definir o segredo dos jobs agendados **antes** de religar o JWT

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (funções/cron) + Infraestrutura
**Achados resolvidos:** CRON-01 (pré-requisito de SEC-02)

**Problema hoje:** três migrations montam a chamada HTTP agendada assim:
`'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)` — por exemplo
`supabase/migrations/20260722115149_be884e60-…sql:19`. E **nenhuma migration define esse GUC**: medido com
`grep -rln "ALTER DATABASE.*app.settings.service_role_key|SET app.settings.service_role_key" supabase/migrations/`
→ **0 arquivos**, contra **3** que o leem. Com o GUC indefinido, `current_setting(…, true)` devolve `NULL` e o
header sai como `Bearer ` vazio. **Esses jobs só funcionam hoje porque todas as edge functions estão
deployadas sem verificação de JWT.**

**Causa raiz:** a chamada agendada foi escrita esperando um parâmetro de banco que nunca foi provisionado; a
falha ficou mascarada pelo `--no-verify-jwt` global.

**Caminho recomendado:**

1. **Esta etapa vem antes da 007 por uma razão específica:** se você religar o JWT primeiro, os jobs agendados
   passam a receber 401 e param de rodar **em silêncio** — não há tratamento de erro no `http_post`/`net.http_post`
   dessas funções, nem alerta de falha de job. Você quebraria `lgpd-retention-daily`,
   `lgpd-sar-deadline-check`, `cost-anomalies-15min` e outros sem nenhum sinal.
2. Decida com o dono entre duas opções, e prefira a segunda:
   - (a) `ALTER DATABASE postgres SET app.settings.service_role_key = '…'` — funciona, mas guarda a
     `service_role` em configuração de banco, legível por qualquer superusuário, e tem de ser refeita a cada
     rotação (etapa 002).
   - (b) **Preferida:** trocar o header dessas chamadas por um segredo dedicado de função
     (`CRON_SECRET`), e fazer cada function-alvo validar esse header com `constantTimeEqual`
     (`supabase/functions/_shared/security.ts`). Assim o job não carrega a chave que ignora a RLS, e a
     verificação é explícita no código em vez de depender do gateway.
3. Escreva **uma** migration nova, aditiva e idempotente, que redefina as funções/jobs afetados para usar o
   header novo. **Não** reaplique nem edite as três migrations antigas — elas são histórico já aplicado
   (`AGENTS.md` → Banco).
4. Padrão de referência para a validação do header: `supabase/functions/bitrix24-webhook/index.ts:90-103`
   (`validateSignature` com `constantTimeEqual`).

**Arquivos e objetos a tocar:** uma migration nova em `supabase/migrations/`; as edge functions alvo dos jobs
(a serem listadas ao ler `cron.job`); secret `CRON_SECRET` no painel do Supabase e em
`.github/workflows/edge-deploy.yml` (bloco `apply_secret`, linhas 48-60).

**Não tocar / armadilhas:** não toque nas três migrations antigas. Não inclua esta etapa na mesma PR da 007:
se a 007 for revertida, o segredo deve permanecer. **Pré-requisito de leitura:** você precisa saber quais jobs
estão realmente ativos em `cron.job` — esta auditoria **não conseguiu ler o banco** e os 12 jobs listados vêm
das migrations, não do banco (ver achado CRON-01, §4). Comece lendo `cron.job` pelo caminho do `DB_MCP_URL`.

**Depende de:** 002 · **Libera:** 007

**Risco e como reverter:** médio — mexe no que faz os jobs agendados autenticarem. Reverter: a migration nova
deve ser escrita de forma que uma segunda migration possa restaurar o header anterior.

**Precisa de aprovação humana antes do merge:** **sim** — migration em banco de produção e criação de segredo.

**Como verificar:**
Consulta de leitura por `DB_MCP_URL`: `SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;` →
nenhum `command` deve conter `app.settings.service_role_key`. Depois, confirme uma execução bem-sucedida:
`SELECT jobname, status, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 007 — Parar de deployar as 89 edge functions com `--no-verify-jwt`

**Onda / Severidade / Camada:** 1 / **Crítica** / Infraestrutura (deploy)
**Achados resolvidos:** SEC-02

**Problema hoje:** `scripts/deploy-edge-functions.sh:23` roda, dentro do laço da linha 18 e **sem exceção**:
`npx --yes supabase functions deploy "$fn" --no-verify-jwt --yes`.
Esse é o único caminho de deploy, e é o que o CI executa (`.github/workflows/edge-deploy.yml:62`), em todo
push na `main` que toque `supabase/functions/**`. Resultado: o `verify_jwt` por function do `config.toml`
fica irrelevante e as 89 sobem publicamente alcançáveis. Há três artefatos em contradição:
`config.toml` declara 9 sem JWT; `supabase/deployment-manifest.json` registra
**`verify_jwt_true: 80`** e `verify_jwt_false: 9` (EXECUTADO: 80 entradas `"verify_jwt": true`); e o script
deploya 89 sem JWT.

**Causa raiz:** a flag global foi posta no laço — provavelmente para destravar o deploy dos webhooks, que
realmente não podem exigir JWT — e nunca foi restringida a eles. O `config.toml` passou a ser documentação
sem efeito.

**Caminho recomendado:**

1. Troque a flag global por uma decisão **por function**, lida do `config.toml` em vez de repetida no script.
   Esboço mínimo, mantendo o estilo do script (ele já é `bash` com `set -euo pipefail` e contadores):
   ler as seções `[functions.<nome>]` com `verify_jwt = false` do `supabase/config.toml` para uma lista, e no
   laço aplicar `--no-verify-jwt` **só** se o nome estiver nela.
2. **O atalho tentador a evitar:** simplesmente remover `--no-verify-jwt` do comando. Isso quebra os 8
   webhooks e proxies que legitimamente não recebem JWT (`openclaw-webhook`, `whatsapp-router`,
   `rag-embed-backfill`, `slack-events-webhook`, `widget-proxy`, `bitrix24-webhook`, `whatsapp-webhook`,
   `webhook-receiver`) — provedores externos não mandam Bearer JWT. A lista correta já existe e é o
   `config.toml`; use-a como fonte da verdade em vez de uma lista nova no script.
3. Faça a etapa 006 **antes**, senão os jobs agendados morrem calados.
4. As 24 functions sem autenticação própria (etapas 008 a 031) continuam precisando da correção delas: o JWT
   do gateway garante "é um usuário logado qualquer", não "é um usuário autorizado a isto". Religar o JWT é
   necessário e insuficiente.

**Arquivos e objetos a tocar:** `scripts/deploy-edge-functions.sh`.

**Não tocar / armadilhas:** não altere o `config.toml` nesta etapa (a 003 já removeu a entrada da
`migrate-helper`). Não mexa no `deployment-manifest.json` — a 032 cuida do guard. Atenção: `rag-embed-backfill`
está no `config.toml` com `verify_jwt = false` **e** é uma das functions sem autenticação própria e com
`service_role` — depois desta etapa ela continua pública; é a etapa 013 que a fecha. Não presuma que o
`config.toml` está correto por estar no repositório: ele é a fonte da verdade para o _deploy_, não um atestado
de que cada escolha ali é certa.

**Depende de:** 006 · **Libera:** 008–031, 032

**Risco e como reverter:** **alto** — é o deploy de todas as functions. Qualquer function que dependia
implicitamente de não exigir JWT passa a devolver 401. Mitigação: faça o merge e, imediatamente, leia o log do
`Edge Deploy` e rode um smoke nas functions chamadas pelo front. Reverter: `git revert` da PR e novo
`workflow_dispatch` do `Edge Deploy` restaura o comportamento anterior em um ciclo.

**Precisa de aprovação humana antes do merge:** **sim** — altera o deploy de produção.

**Como verificar:**
(a) No log do `Edge Deploy` após o merge, confirme que o comando aparece **sem** `--no-verify-jwt` para uma
function que deve ser protegida (ex.: `llm-gateway`) e **com** a flag para `webhook-receiver`.
(b) Teste de comportamento: `curl -s -o /dev/null -w "%{http_code}" -X POST
https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/llm-gateway` → esperado **401** (hoje não é).
E `… /functions/v1/webhook-receiver` → **não** 401 por falta de JWT (deve seguir para a validação HMAC dele).

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 008 — `cron-executor`: exigir identidade do chamador (usuário **ou** cron)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (1 de 24)

**Problema hoje:** o handler inteiro vai de `supabase/functions/cron-executor/index.ts:10` a `:165` e **não tem
uma única linha que estabeleça quem chamou**. A sequência é: CORS (`:11-12`) → rate limit (`:14-16`) → zod
`z.object({}).passthrough().optional()` (`:8`, `:19-27`) → `createClient(supabaseUrl, serviceRoleKey)`
(`:28-35`). A `service_role` é lida em `:29`
(`const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`) e usada no cliente em `:35`.
Qualquer pessoa na internet faz um POST com corpo vazio e dispara **todos** os jobs agendados vencidos
(`:40-46`, `limit(50)`), com escrita em `cron_schedule_executions` (`:114`) e em `cron_schedules` (`:142`).

**Causa raiz:** a function foi escrita assumindo um único chamador (o cron do Postgres), e por isso o
desenho nunca previu checagem de identidade. Quando o frontend passou a invocá-la também
(`src/services/cronSchedulerService.ts:407`), nenhum dos dois caminhos ganhou verificação.

**Caminho recomendado:**

1. Esta function tem **dois chamadores legítimos de naturezas diferentes**, e é por isso que ela precisa dos
   dois mecanismos — não escolha um:
   - **cron / job** → valide um segredo de serviço no header, com `constantTimeEqual`
     (`supabase/functions/_shared/security.ts:16-27`). Padrão de referência no repositório:
     `supabase/functions/bitrix24-webhook/index.ts:89-103` (`validateSignature` comparando o token recebido
     com `requireEnv(...)` em tempo constante). O nome do segredo é o que a **etapa 006** definiu
     (`CRON_SECRET`); não invente outro.
   - **usuário na tela de agendamentos** → `authenticateRequest` do barril
     `supabase/functions/_shared/mod.ts:25`. Referência de uso correto:
     `supabase/functions/whatsapp-outbound/index.ts:20` (importação) e `:9-11` (o comentário que documenta a
     regra: JWT obrigatório, workspace resolvido server-side).
2. Ordem no handler: logo depois do rate limit (`:16`), antes de qualquer leitura de env ou de banco. Primeiro
   tente o segredo de serviço; se não houver, caia para `authenticateRequest`; se nenhum dos dois passar,
   **401 e encerre**. Nunca siga para `:28`.
3. **O atalho tentador a evitar:** exigir só JWT de usuário. O cron do Postgres **não tem** JWT de usuário —
   hoje ele manda `Bearer ` vazio (achado CRON-01) e, depois da etapa 006, manda o segredo. Se você exigir
   apenas JWT, os jobs agendados param de rodar **em silêncio**, porque o `http_post` das migrations não
   trata erro. O inverso também é atalho: exigir só o segredo fecharia a tela de agendamentos do usuário.
4. Quando o chamador for usuário, filtre os `cron_schedules` pelo workspace dele em `:40-46`. Hoje a consulta
   não tem filtro de workspace nenhum — qualquer usuário autenticado dispararia os jobs de todos os clientes.

**Arquivos e objetos a tocar:** `supabase/functions/cron-executor/index.ts` (apenas o bloco de entrada do
handler, `:10-35`, e o filtro da consulta em `:40-46`).

**Não tocar / armadilhas:** **não** mexa em `computeNextCronUtc` (`:167-216`) — é cálculo de agenda, sem
relação. **Não** corrija aqui o achado SEC-06 (`:62-70` monta a URL de destino a partir de
`schedule.target_id` sem validar, e põe a `service_role` no header `Authorization`): isso é a **etapa 038**,
e misturar as duas numa PR impede reverter uma sem a outra. Armadilha de deploy: esta function **não** está
entre as 9 com `verify_jwt = false` do `supabase/config.toml:3-31`, então depois da etapa 007 o gateway já
exige JWT — mas o cron entra por outro caminho, e o gateway garante "é alguém logado", não "é quem pode
rodar este job".

**Depende de:** 006, 007 · **Libera:** 038

**Risco e como reverter:** médio — se o segredo não estiver aplicado nas edges quando esta PR subir, os jobs
agendados param. Confirme que a etapa 006 está mergeada e o `CRON_SECRET` aplicado (bloco `apply_secret` de
`.github/workflows/edge-deploy.yml:48-60`) **antes** do merge. Reverter: `git revert` + `workflow_dispatch`
do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** (código de edge function; sem DDL, sem segredo novo,
sem CI). O segredo já foi criado na etapa 006.

**Como verificar:**

```
# (a) sem credencial nenhuma → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/cron-executor \
  -H "content-type: application/json" -d '{}'
# esperado 401 (hoje: 200 com a lista de jobs executados)

# (b) com o segredo de serviço correto → 200
curl -s -X POST .../functions/v1/cron-executor -H "x-cron-secret: $CRON_SECRET" -d '{}'
# esperado 200
```

Depois do merge, confirme que os jobs continuam rodando pelo `DB_MCP_URL`:
`SELECT jobname, status, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;` → sem
`status = 'failed'` nas execuções posteriores ao deploy. **Esta consulta depende de `DB_MCP_URL`, que a
auditoria não tinha** (`01-INVENTARIO.md` §6: nenhum MCP desta sessão aponta para `qdlnzopxrlsoljcrcmzv`);
se você também não tiver, registre a verificação (a)/(b) e marque a confirmação de banco como pendente em
vez de afirmar que os jobs estão rodando.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 009 — `queue-worker`: exigir identidade do chamador (usuário **ou** cron)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (2 de 24)

**Problema hoje:** `supabase/functions/queue-worker/index.ts:20-56` — CORS (`:21-22`), rate limit (`:24-26`),
zod (`:14-18`, `:29-48`) e em seguida
`createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)` em `:53-56`.
**Nenhuma checagem de identidade em nenhum ponto do handler.** Um POST anônimo drena a fila de trabalho de
**todos os workspaces**: `:68` lê `task_queues` sem filtro algum (`select('*').eq('is_paused', false)`), e o
laço `:79-211` marca itens como `processing` (`:116-126`), dispara a function de destino com a `service_role`
no header (`:136-143`) e grava `completed`/`dead_letter` (`:147-186`).

**Causa raiz:** idêntica à 008 — worker desenhado para um chamador de confiança (cron), exposto depois ao
frontend (`src/services/queueManagerService.ts:308`) sem que nenhum dos dois caminhos ganhasse verificação.

**Caminho recomendado:**

1. Dois mecanismos, pela mesma razão da etapa 008: segredo de serviço (`constantTimeEqual`,
   `_shared/security.ts:16-27`, no padrão de `bitrix24-webhook/index.ts:89-103`) para o cron, e
   `authenticateRequest` (`_shared/mod.ts:25`; uso correto em `whatsapp-outbound/index.ts:20`) para o botão
   "processar agora" da tela de filas.
2. Insira o gate **entre `:26` e `:28`**, antes do `req.json()`. Isso importa aqui mais que na 008: o corpo
   aceita `batch_size` até 20 (`:17`) e cada item dispara uma function externa (`:136`) — validar o payload
   antes de saber quem é dá a um anônimo controle sobre quanto trabalho o sistema executa.
3. **Faça a etapa 008 primeiro e copie exatamente a mesma forma do gate.** As duas são o mesmo problema no
   mesmo formato; duas implementações diferentes do mesmo gate é como esta classe de defeito volta.
4. Quando o chamador for usuário, filtre `task_queues` por `workspace_id` em `:61-69`. Sem isso, um usuário
   autenticado de um workspace processa a fila de outro — exatamente o achado SEC-10 em forma nova.
5. **Atalho a evitar:** confiar em `worker_id` (`:16`, `:50`) como identidade. É um campo livre do payload com
   default gerado no servidor (`worker-${crypto.randomUUID()...}`); serve para rastreio de lock, não para
   autorização.

**Arquivos e objetos a tocar:** `supabase/functions/queue-worker/index.ts` (entrada do handler `:20-56`;
consulta `:61-69`).

**Não tocar / armadilhas:** não altere a lógica de lock/retry (`:113-189`) nem os contadores de fila
(`:193-203`) — é o mecanismo que evita processamento duplicado e mexer nele aqui mistura dois riscos.
Armadilha: `:140` repassa `SUPABASE_SERVICE_ROLE_KEY` como `Authorization` para a function-alvo
(`payload._target_function`, `:132`) — é a mesma forma do SEC-06 e **não é escopo desta etapa**; registre nos
"Próximos passos" se a etapa 038 não cobrir também este ponto. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 006, 007, 008 · **Libera:** —

**Risco e como reverter:** médio — se o segredo não estiver aplicado, a drenagem agendada da fila para e os
itens acumulam em `pending`. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/queue-worker
-H "content-type: application/json" -d '{"batch_size":1}'` → esperado **401** (hoje: 200 com
`queues_processed`). Com o segredo de serviço → 200. Teste de regressão já existente:
`npx vitest run src/test/queue-manager.test.ts` (4 asserções sobre a invocação, `:101-135`) → tem de
continuar passando.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 010 — `openclaw-proxy`: exigir JWT de usuário antes de gastar o token do OpenClaw

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (3 de 24)

**Problema hoje:** `supabase/functions/openclaw-proxy/index.ts:26-60` — CORS (`:27-28`), rate limit
(`:30-32`), leitura de `OPENCLAW_URL` e `OPENCLAW_API_TOKEN` (`:35-36`), e `req.json()` em `:59`.
**Nenhuma checagem de identidade.** A `service_role` entra em `makeAdmin()` (`:12-17`,
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` em `:14`), usada para gravar `openclaw_events` (`:22`) e para o
cache de idempotência (`:89-100`, `:163-166`). Pior que o banco: `:125-128` monta
`'Authorization': \`Bearer ${openclawToken}\``e`:137-145`repassa a requisição ao OpenClaw. O mapa de ações`:102-115`inclui`whatsapp.send`, `agent.create`, `agent.update`, `agent.delete`e`skill.deploy` — ou seja,
**um anônimo manda mensagem de WhatsApp e apaga agentes usando a conta paga do dono**.

**Causa raiz:** o proxy foi criado para o motivo certo (tirar a credencial do provedor do navegador — a mesma
intenção documentada em `whatsapp-outbound/index.ts:4-12`), mas só metade foi feita: a credencial saiu do
browser e a autorização não entrou no servidor. O resultado é um proxy aberto para uma API paga.

**Caminho recomendado:**

1. Mecanismo **(i), só ele**: `authenticateRequest` do barril `_shared/mod.ts:25`. Aqui não há chamador de
   serviço — o único chamador é a UI (`src/services/openclawDeployService.ts:90`, com o badge de status em
   `src/components/openclaw/OpenclawStatusBadge.tsx:14`). Referência de uso correto, incluindo a resolução de
   workspace server-side: `supabase/functions/whatsapp-outbound/index.ts:9-11,20`.
2. Ponha o gate **antes de `:35`**, não depois do parse. Razão concreta: `:70` lê
   `payload?.workspace_id ?? req.headers.get('x-workspace-id') ?? 'global'` e usa isso como chave do circuit
   breaker. Com o gate antes, você substitui essa linha pelo `workspaceId` que o `authenticateRequest`
   devolveu — e aí o isolamento multi-tenant do breaker passa a ser real em vez de declarado. Hoje qualquer
   chamador escolhe o bucket do breaker de outro workspace e pode abri-lo de propósito (negação de serviço
   contra um cliente específico).
3. **Atalho tentador a evitar:** adicionar uma allowlist de ações "seguras" (deixar `health` e `agents`
   abertos e fechar só as mutativas). Isso mantém um oráculo anônimo sobre a infraestrutura do dono e **não
   resolve o custo**: cada `GET /api/v1/agents` já é uma chamada à API paga. Feche a function inteira; o
   `health` tem dono próprio (`health-check`, etapa 021).
4. Depois de autenticar, confirme que o `workspace_id` usado em `emitEvent` (`:22`) é o resolvido no servidor,
   não o do payload.

**Arquivos e objetos a tocar:** `supabase/functions/openclaw-proxy/index.ts` (entrada do handler `:26-36` e a
resolução de `workspaceId` em `:70`).

**Não tocar / armadilhas:** não mexa no circuit breaker (`_shared/circuitBreaker.ts`) nem na idempotência
(`_shared/idempotency.ts`) — os dois estão corretos e são usados por outras functions. Não altere o mapa de
endpoints `:102-115`. Armadilha: o `catch` em `:173-180` recalcula `workspaceId` a partir do header
(`:175`); se você só trocar `:70`, esse caminho continua aceitando header livre — ajuste os dois. Esta
function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo. O badge de status (`OpenclawStatusBadge`) passa a precisar de sessão — e
isso é o comportamento correto, já que ele só aparece na área logada. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/openclaw-proxy \
  -H "content-type: application/json" -d '{"action":"health"}'
```

Esperado **401**. Hoje devolve 200 com o corpo do `/api/health` do OpenClaw (ou 502 se o secret não estiver
posto — o que **não** prova que a autenticação existe). Repita com JWT válido de usuário → 200 ou 502/503
conforme o estado do upstream, nunca 401.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 011 — `a2a-server`: parar de inventar credencial e separar descoberta pública de execução de tarefa

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (4 de 24), **SEC-05**

**Problema hoje:** duas falhas no mesmo handler (`supabase/functions/a2a-server/index.ts:196-258`):

1. `:235` — `const authHeader = req.headers.get('Authorization') || \`Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}\`;`
Quando o chamador **não manda credencial**, a function **fabrica uma** e segue processando a tarefa
(`:237-247`). Ausência de identidade tratada como identidade anônima válida.
2. A `service_role` é lida em `:202` e passada como `supabaseKey` para `getAgentCard` (`:216`) e para
   `processTask` (`:244`) — ou seja, a execução da tarefa roda com a chave que ignora a RLS.
   Não há nenhuma checagem de identidade entre `:196` e `:247`: só CORS (`:197`), parsing de rota (`:199-200`) e
   rate limit (`:207-210`).

**Causa raiz:** o protocolo A2A prevê que a descoberta (`GET /.well-known/agent.json`) seja pública e que o
envio de tarefa seja autenticado — o campo `authentication.schemes` do próprio `AgentCard` (`:58-60`) existe
para anunciar isso. A implementação tratou as duas rotas com o mesmo nível de confiança e, no lugar de
recusar quem não se identifica, preencheu a lacuna com uma credencial do servidor.

**Caminho recomendado:**

1. **Separe as duas rotas, porque elas têm requisitos opostos.** Isto é o ponto da etapa:
   - `GET /.well-known/agent.json` (`:214-218`) — permanece **sem** JWT: é descoberta, e agentes externos
     precisam ler o card antes de ter credencial. Mas troque a chave: use `SUPABASE_ANON_KEY` em
     `getAgentCard`, não a `service_role` de `:202`. O card deve expor só o que a RLS permite a anônimo.
   - `POST /tasks/send` (`:221-250`) — exige identidade, **com dois mecanismos**, porque tem dois chamadores
     legítimos: a UI interna (`src/components/integrations/A2APanel.tsx:36` e
     `src/services/llmGatewayService.ts:166`) e agentes externos.
     Para a UI: `authenticateRequest` (`_shared/mod.ts:25`; referência `whatsapp-outbound/index.ts:20`).
     Para agentes externos: `validateApiKey` (`_shared/mod.ts:29`, implementado em
     `_shared/auth.ts:146-166` — compara SHA-256 em tempo constante contra `api_keys` e devolve
     `workspace_id`/`agent_id`). Este helper **já existe e é o padrão certo**; a cascata pronta está em
     `supabase/functions/geo-code/index.ts:50-59` (`validateApiKey` → `getAuthUserId` → 401), copie essa forma.
2. **Apague a fabricação de credencial de `:235`.** Sem credencial → 401. Nunca `|| Bearer <chave do sistema>`.
3. Depois de autenticar, repasse o **token do chamador** a `processTask`, não a `service_role` de `:202`.
4. **Atalho tentador a evitar:** deixar `POST /tasks/send` aberto "porque é protocolo entre máquinas".
   Agente externo se identifica por API key — é para isso que `api_keys` e `validateApiKey` existem. E note
   que `:221` aceita o POST também em `path === '/'`, a mesma rota do card público: se você autorizar por
   rota sem olhar o método, abre tudo de novo.

**Arquivos e objetos a tocar:** `supabase/functions/a2a-server/index.ts` (`:196-250`, em especial `:202`,
`:216`, `:235-247`).

**Não tocar / armadilhas:** não altere `A2ATaskSchema` (`:22-33`) nem a montagem do `AgentCard` (`:41-60`) —
mudar o formato do card quebra agentes externos já integrados. Armadilha de rota: `:200` normaliza o path
removendo o prefixo `/a2a-server`, e `/`, `/tasks` e `/tasks/send` caem no **mesmo** ramo POST (`:221`);
qualquer gate que você escreva tem de casar por método + path depois dessa normalização, não antes. Esta
function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31` — mas a rota do card precisa
continuar acessível sem JWT, então **a etapa 007 vai quebrar a descoberta pública**: decida com o dono se o
card deve ser servido por outra function (ou se `a2a-server` entra na lista de `verify_jwt = false` e a
defesa passa a ser só este código). Registre a decisão; não a deixe implícita.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio — se algum agente externo já integrado chama `/tasks/send` sem credencial,
ele para. Antes do merge, confira `SELECT count(*) FROM api_keys WHERE is_active` e procure chamadas recentes
nos logs da function; se não tiver acesso ao banco, diga isso na PR em vez de supor que não há integração
externa. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **sim** — a decisão sobre a rota do card no `config.toml`
muda o deploy, e fechar `/tasks/send` pode interromper uma integração de parceiro (efeito de negócio).

**Como verificar:**

```
# (a) card público continua respondendo sem credencial
curl -s -o /dev/null -w "%{http_code}\n" ".../functions/v1/a2a-server/.well-known/agent.json"   # 200

# (b) tarefa sem credencial → 401 (hoje: 200, com a credencial fabricada em :235)
curl -s -o /dev/null -w "%{http_code}\n" -X POST ".../functions/v1/a2a-server/tasks/send" \
  -H "content-type: application/json" \
  -d '{"message":{"parts":[{"type":"text","text":"ping"}]}}'

# (c) com x-api-key de uma chave ativa → 200
```

Registre os três status.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 012 — `incident-orchestrator`: exigir identidade antes de pausar agentes de produção

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (5 de 24)

**Problema hoje:** `supabase/functions/incident-orchestrator/index.ts:24-46` — CORS (`:25-26`), rate limit
(`:28-30`), zod `InputSchema` (`:18-22`, `:33-40`) e
`createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))` em `:43-46`.
**Nenhuma checagem de identidade.** E o que a function faz é destrutivo: `:92-104` executa
`.from('agents').update({ status: 'paused' }).eq('workspace_id', pb.workspace_id)` — sem `agent_id` no
config, **pausa todos os agentes ativos do workspace** (`:100`); `:81-91` desliga todos os
`chaos_experiments`; `:112-118` chama `get_current_oncall`. Basta um POST anônimo com um `playbook_id` válido
(uuid, `:19`) para derrubar a operação de um cliente.

**Causa raiz:** a function é um orquestrador pensado para ser acionado por automação de alerta, e o
`workspace_id` não vem do chamador — vem do playbook (`pb.workspace_id`, `:85`). Isso dispensou o autor de
resolver identidade, e com isso a autorização inteira desapareceu: **conhecer o uuid do playbook virou a
credencial**.

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`; referência de uso
   `whatsapp-outbound/index.ts:9-11,20`). O único chamador hoje é a UI
   (`src/services/incidentService.ts:105`).
2. Depois de autenticar, **valide o pertencimento ao workspace do playbook** — este é o passo que importa
   mais aqui, e não é o óbvio. Carregue o playbook primeiro (`:62-67`), e só então confira
   `validateWorkspaceMembership(supabaseAdmin, user.id, pb.workspace_id)`
   (`_shared/auth.ts:171-184`, exportado em `_shared/mod.ts:30`). Sem isso, um usuário autenticado de
   qualquer workspace pausa os agentes de outro — porque, repito, o workspace vem do playbook, não do
   chamador. O achado SEC-10 é exatamente esta forma.
   **Cuidado com a ordem:** hoje `create_incident_run` é chamado em `:49-53` **antes** de o playbook ser
   carregado. Se você autenticar e validar membership só depois de `:49`, já terá criado um run e consumido
   o cooldown de um workspace alheio. Mova a leitura do playbook para antes do `create_incident_run`.
3. **Atalho tentador a evitar:** adicionar um segredo de serviço e parar aí, raciocinando "isto é chamado por
   automação". A UI chama a function (`incidentService.ts:105`) e uma pessoa aperta o botão; trocar JWT por
   segredo compartilhado apagaria o `triggered_by` real (`:51`, hoje aceita texto livre do payload, `:21`) e
   com ele a trilha de quem pausou a produção. Se mais tarde surgir um disparo automático, acrescente o
   segundo mecanismo como nas etapas 008/009 — não substitua o primeiro.

**Arquivos e objetos a tocar:** `supabase/functions/incident-orchestrator/index.ts` (`:24-67`).

**Não tocar / armadilhas:** não altere as RPCs `create_incident_run` / `update_incident_run` nem o laço de
ações (`:73-141`) — são banco e regra de negócio, fora do escopo. Não troque `triggered_by` por um valor
derivado do usuário na mesma PR: é melhoria de auditoria, outra etapa. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo para o sistema, médio para quem dependa de um disparo automático não
documentado. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/incident-orchestrator \
  -H "content-type: application/json" \
  -d '{"playbook_id":"00000000-0000-0000-0000-000000000000"}'
```

Esperado **401** (hoje: passa da autenticação e devolve 500/`playbook not found`, provando que já executou
`create_incident_run` com privilégio total). Em seguida, com JWT de um usuário do workspace A e o
`playbook_id` de um playbook do workspace B → esperado **403**. Este segundo teste exige dois usuários de
workspaces diferentes; se você não tiver credencial de teste (a auditoria não tinha —
`01-INVENTARIO.md` §6), registre só o primeiro e marque o teste de isolamento como pendente, sem afirmar que
o isolamento está provado.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 013 — `rag-embed-backfill`: validar segredo de serviço (é a **única** defesa possível aqui)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (6 de 24)

**Problema hoje:** `supabase/functions/rag-embed-backfill/index.ts:73-85` — CORS (`:74-75`), rate limit
(`:77-79`), e então `requireEnv('SUPABASE_SERVICE_ROLE_KEY')` em `:83` com
`createClient(supabaseUrl, serviceKey)` em `:85`. **Nenhuma checagem de identidade.** Em `:131` a function
monta `const authHeader = \`Bearer ${serviceKey}\``e repassa essa credencial ao`rag-embed-v2`
(`:42-54`, via `embedBatch`chamado em`:158-160`e`:226-228`). Cada execução processa até 200 linhas
(`MAX_ROWS`, `:20`) em lotes de 20 (`:19`) — isto é, **um POST anônimo gasta 10 chamadas de embedding**.

**E aqui há um agravante que não existe nas outras etapas:** esta é a **única** das 24 que está na lista de
`verify_jwt = false` do `supabase/config.toml:9-10`:

```
[functions.rag-embed-backfill]
verify_jwt = false
```

Ou seja: **mesmo depois da etapa 007, o gateway continua deixando passar requisição sem JWT para esta
function**. A correção de código é a defesa inteira, não uma camada adicional.

**Causa raiz:** a function tem três chamadores, todos de serviço — cron a cada 5 min (documentado em `:1-4`),
`doc-parse/index.ts:647` e `doc-rechunk/index.ts:224`, ambos por `supabase.functions.invoke` de dentro de
outra edge. Como nenhum é uma pessoa, alguém marcou `verify_jwt = false` para destravar os chamadores
internos — e não pôs nada no lugar.

**Caminho recomendado:**

1. Mecanismo **(ii), apenas ele**: valide um segredo de serviço no header com `constantTimeEqual`
   (`_shared/security.ts:16-27`), no padrão de `bitrix24-webhook/index.ts:89-103`. Use o segredo definido na
   etapa 006 (`CRON_SECRET`). **Não** use `authenticateRequest`: não existe chamador-pessoa
   (`grep -rn "rag-embed-backfill" src/` devolve só o teste de contrato
   `src/test/embedding-dimension-contract.test.ts:50,59,87`, nunca uma invocação de runtime).
2. **Atualize os dois chamadores internos na mesma PR**, senão a indexação de documentos para de funcionar em
   silêncio (os dois usam `.catch(() => {})` — `doc-parse/index.ts:650` — e a falha não aparece em lugar
   nenhum): passe o header do segredo em `doc-parse/index.ts:647-650` e `doc-rechunk/index.ts:224`.
   É por isso que esta etapa toca três arquivos e não um.
3. **Atalho tentador a evitar:** tirar `rag-embed-backfill` da lista de `verify_jwt = false` do
   `config.toml` e considerar resolvido. Dois motivos para não fazer: (a) os chamadores internos passam a
   receber 401 — `functions.invoke` de dentro de uma edge não carrega JWT de usuário; (b) a lista do
   `config.toml` é insumo da etapa 007 e da 032, e mudá-la aqui faz o guard de CI acusar divergência numa PR
   que não é sobre deploy. Deixe a entrada como está e feche pelo código.
4. Depois do gate, verifique `:131`: com o segredo validado, o repasse de `Bearer ${serviceKey}` ao
   `rag-embed-v2` passa a ser uma chamada interna legítima — `rag-embed-v2/index.ts:145` já documenta que
   espera exatamente isso. Não troque esse repasse.

**Arquivos e objetos a tocar:** `supabase/functions/rag-embed-backfill/index.ts` (`:73-85`);
`supabase/functions/doc-parse/index.ts:645-651`; `supabase/functions/doc-rechunk/index.ts:224`.

**Não tocar / armadilhas:** **não** mexa em `embedBatch` (`:37-71`), em especial não toque na checagem
`data?.degraded === true` de `:62-64` nem no campo `dimension` (singular) de `:52` — os comentários
`:49-51` e `:58-61` registram dois bugs já corrigidos, e há teste de contrato que falha se você reverter
(`src/test/embedding-dimension-contract.test.ts:87` exige a string `degraded === true` no arquivo).
Não mexa no dead-letter por `embed_attempts >= 5` (`:5-7`). Armadilha operacional: se você fizer o gate e
esquecer o passo 2, a sintoma será "documentos enviados ficam sem busca semântica", não um erro — ninguém vai
ligar as duas coisas.

**Depende de:** 006, 007 · **Libera:** —

**Risco e como reverter:** médio-alto, por causa do silêncio: a falha não gera erro visível. Reverter:
`git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
# (a) anônimo → 401 (hoje: 200, e com isso até 200 linhas embedadas)
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/rag-embed-backfill \
  -H "content-type: application/json" -d '{}'
# (b) com o segredo → 200
curl -s -X POST .../functions/v1/rag-embed-backfill -H "x-cron-secret: $CRON_SECRET" -d '{}'
```

E a verificação ponta a ponta que prova o passo 2: suba um documento pela UI e confirme que os chunks saem de
`embedding_status = 'pending'`. Sem acesso ao banco (`01-INVENTARIO.md` §6), use o log da function
`rag-embed-backfill` no painel do Supabase e procure a invocação disparada pelo `doc-parse` logo após o
upload; se não conseguir nem isso, registre a etapa como **parcialmente verificada** e diga qual parte faltou.
Teste local obrigatório: `npx vitest run src/test/embedding-dimension-contract.test.ts`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 014 — `validate-access`: o portão de IP/país que qualquer um atravessa e envenena

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + RBAC
**Achados resolvidos:** SEC-02 (7 de 24)

**Problema hoje:** `supabase/functions/validate-access/index.ts:68-96` — rate limit (`:70-72`), CORS
(`:69`, `:73`), zod (`:31-36`, `:76-86`) e
`createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))` em `:93-96`.
**Nenhuma checagem de identidade.** Três consequências concretas, todas verificadas no código:

1. `:87-88` — `workspace_id` **e `user_id`** vêm do payload. A function grava esses valores em
   `access_blocked_log` (`:119-126` e `:146-153`) com `service_role`. Um anônimo escreve linhas de log de
   bloqueio atribuídas a **qualquer usuário de qualquer workspace**: o relatório que a tela mostra
   (`src/services/accessControlService.ts:118-125`) passa a ser falsificável.
2. `:107-111` e `:135-138` — quem chamar descobre, por tentativa, se um workspace tem regra de IP ou de país
   configurada (basta comparar as respostas). Oráculo de configuração de segurança.
3. `:99-104` — sem `workspace_id`, devolve `{ allowed: true }`. O default da função cujo nome é
   "validate access" é **permitir**.

**Causa raiz:** a function foi escrita como utilitário consultivo ("best-effort", `:14-16`) e não como
fronteira. Um utilitário consultivo que escreve em tabela de auditoria com `service_role` deixou de ser
consultivo sem que o desenho acompanhasse.

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`; referência
   `whatsapp-outbound/index.ts:9-11,20`). Chamador único:
   `src/services/accessControlService.ts:129-134` (`validateAccess(workspaceId)`).
2. **Pare de ler identidade do payload.** Isto é o cerne desta etapa:
   - `user_id` (`:88`) → use `user.id` devolvido pelo `authenticateRequest`. Remova o campo do schema
     (`:34`) para que um cliente não possa mais sugeri-lo.
   - `workspace_id` (`:87`) → aceite, mas valide com `validateWorkspaceMembership`
     (`_shared/auth.ts:171-184`) antes de qualquer consulta ou insert.
3. Decida com o dono o comportamento de `:99-104` (sem workspace → `allowed: true`). A correção coerente é
   negar, pelo mesmo raciocínio da etapa 033 no `llm-gateway` (COST-02: "não sei de quem é" ≠ "não há regra").
   **Mas negar aqui pode trancar usuário legítimo**, porque o frontend chama a função antes de ter workspace
   em alguns fluxos — por isso levante os chamadores antes e, se houver dúvida, deixe o default atual e abra
   a mudança como etapa própria, registrando no progresso. Não troque o default às cegas.
4. **Atalho tentador a evitar:** confiar em `cf-connecting-ip` / `x-forwarded-for` (`:38-45`) como se fossem
   confiáveis. São headers, e um chamador direto à edge os escolhe. A autenticação não resolve isso — o
   comentário `:14-17` já diz o certo: a regra de IP/geo de verdade pertence ao WAF/CDN. Não prometa na PR
   que esta function passou a ser uma fronteira de rede; ela passou a exigir login, o que é outra coisa.

**Arquivos e objetos a tocar:** `supabase/functions/validate-access/index.ts` (`:31-36` schema; `:68-96`
entrada; `:119-126` e `:146-153` inserts).

**Não tocar / armadilhas:** não mexa em `ipMatches` (`:53-66`) nem em `extractCountry` (`:47-51`).
Armadilha: `:73` trata o `OPTIONS` **depois** do rate limit (`:70-72`) — é estranho mas funciona; não
reordene de brincadeira, e se mover o gate de auth, ponha-o **depois** do `OPTIONS`, senão o preflight do
navegador passa a receber 401 e toda chamada do front quebra com erro de CORS (que não parece erro de auth e
custa horas para diagnosticar). Esta function **não** tem `verify_jwt = false` no
`supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo, com a ressalva do passo 3. Reverter: `git revert` + `workflow_dispatch` do
`Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** — a menos que você mude o default de `:99-104`, e
nesse caso **sim** (muda comportamento de acesso de usuário).

**Como verificar:**

```
# (a) anônimo → 401 (hoje: 200 com { allowed, ip, country })
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/validate-access \
  -H "content-type: application/json" -d '{"workspace_id":"<uuid real>"}'
# (b) prova de que o envenenamento de log fechou: com JWT do usuário A, mande
#     user_id do usuário B e workspace_id do workspace de A
```

Em (b), a linha gravada em `access_blocked_log` tem de trazer o id de **A**, não o de B. Conferir isso exige
ler a tabela, o que precisa de acesso ao banco — se não tiver, registre o resultado de (a) e deixe (b) como
pendente explícito.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 015 — `synthetic-runner`: exigir identidade (usuário **ou** cron) antes de disparar as sondas

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (8 de 24)

**Problema hoje:** `supabase/functions/synthetic-runner/index.ts:106-114` — CORS (`:107-108`), rate limit
(`:110-112`) e `createClient(SUPABASE_URL, SERVICE_ROLE)` em `:114`. **Nenhuma checagem de identidade.** A
`service_role` é lida no topo do módulo (`:26`, `requireEnv('SUPABASE_SERVICE_ROLE_KEY')`) e usada em três
lugares: no cliente de banco (`:114`) e, dentro de `pingTarget`, como `Authorization: Bearer ${SERVICE_ROLE}`
(`:53`) **e** como `apikey: SERVICE_ROLE` (`:54`, `:64`). Um POST anônimo faz o sistema disparar sondas
autenticadas com privilégio total contra `llm-gateway` (`:67-73` — **chamada de LLM paga**) e
`agent-workflow-runner` (`:74-76`), e grava em `synthetic_results`.

**Causa raiz:** mesma forma das etapas 008/009 — runner de cron (1 min, documentado em `:2`) que recebeu um
modo "on-demand" pela UI (`:6`, `src/services/syntheticService.ts:100`) sem que nenhum dos dois caminhos
ganhasse verificação.

**Caminho recomendado:**

1. Dois mecanismos, pelas mesmas razões das etapas 008 e 009: segredo de serviço com `constantTimeEqual`
   (`_shared/security.ts:16-27`, padrão `bitrix24-webhook/index.ts:89-103`) para o cron, e
   `authenticateRequest` (`_shared/mod.ts:25`, referência `whatsapp-outbound/index.ts:20`) para o modo
   on-demand da tela.
2. **Faça as etapas 008 e 009 antes e reutilize o mesmo gate.** Estas três são o mesmo problema na mesma
   forma; se você implementar o gate de três maneiras diferentes, a próxima pessoa não vai saber qual é o
   padrão do repositório — e é assim que esta classe de defeito se reproduz.
3. No modo on-demand (`:120-140`), depois de autenticar, filtre o `synthetic_checks` pelo workspace do
   usuário: `:134-139` busca por `id` sem nenhum filtro de `workspace_id`, embora a tabela tenha a coluna
   (`:30`). Hoje um usuário dispara o check de outro cliente.
4. **Atalho tentador a evitar:** trocar a `service_role` de `:53-54` por uma chave menos privilegiada
   "de uma vez". A sonda precisa atravessar as functions-alvo e o PostgREST, e `:88-89` trata 4xx como
   "serviço vivo" de propósito — mexer na credencial da sonda muda o significado da métrica de
   disponibilidade sem avisar ninguém. Nesta etapa, só o gate de entrada.

**Arquivos e objetos a tocar:** `supabase/functions/synthetic-runner/index.ts` (`:106-114` e o filtro de
`:133-140`).

**Não tocar / armadilhas:** não mexa em `pingTarget` (`:38-104`). Ponto importante para não confundir com o
SEC-06: o `target` **é** restrito a uma lista fechada (`health` `:60`, `llm-gateway` `:67`,
`agent-workflow-runner` `:74`, com `else` recusando em `:77-84`) — **não** há URL arbitrária aqui, diferente
do `cron-executor`. Não "conserte" o que não está quebrado. Não toque em `consecutive_failures`. Esta
function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 006, 007, 008 · **Libera:** —

**Risco e como reverter:** médio — se o segredo não estiver aplicado, as sondas de 1 min param e o painel de
disponibilidade fica sem dado novo (sem erro visível). Reverter: `git revert` + `workflow_dispatch`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/synthetic-runner
-H "content-type: application/json" -d '{}'` → esperado **401** (hoje: 200, e com isso uma chamada paga ao
`llm-gateway`). Com o segredo → 200. Depois do deploy, confirme na tela de monitoramento que surgiram
`synthetic_results` novos no minuto seguinte; sem acesso ao banco, use o log da function no painel do
Supabase.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 016 — `slack-alert-dispatcher`: autenticar os dois chamadores (UI e trigger do banco)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (9 de 24)

**Problema hoje:** `supabase/functions/slack-alert-dispatcher/index.ts:55-74` — CORS (`:56`), rate limit
(`:57-59`), método (`:60`), zod (`:36-53`, `:62-69`) e
`createClient(supabaseUrl, serviceKey)` em `:73-74`, com
`requireEnv('SUPABASE_SERVICE_ROLE_KEY')` em `:73`. **Nenhuma checagem de identidade.** Qualquer pessoa
monta um payload que satisfaça o `AlertSchema` (`:36-45`: `workspace_id` uuid, `category`, `severity`,
`title`) e **publica a mensagem que quiser no Slack da empresa**, com a aparência de alerta de segurança do
sistema.

**Causa raiz:** o próprio cabeçalho (`:8-11`) documenta dois modos de invocação — trigger `AFTER INSERT` por
`pg_net.http_post` e teste manual da UI — e nenhum dos dois foi amarrado a uma credencial. Autenticar os dois
exigia dois mecanismos, e o caminho mais curto foi não exigir nenhum.

**Caminho recomendado:**

1. Dois mecanismos, e desta vez o segundo tem uma restrição dura imposta pelo banco:
   - **UI** (`src/components/slack/SlackTestBroadcastButton.tsx:18` e `src/hooks/useSlackConfig.ts:144`) →
     `authenticateRequest` (`_shared/mod.ts:25`; referência `whatsapp-outbound/index.ts:20`), seguido de
     `validateWorkspaceMembership` (`_shared/auth.ts:171-184`) contra o `workspace_id` do payload (`:38`).
     Sem esse segundo passo, um usuário de um workspace continua podendo publicar no canal de outro, porque o
     `workspace_id` é dado de entrada.
   - **Trigger do banco** → segredo de serviço com `constantTimeEqual` (`_shared/security.ts:16-27`,
     padrão `bitrix24-webhook/index.ts:89-103`).
2. **Leia a migration do trigger antes de escrever qualquer código.** Ela é a razão de esta etapa ser mais
   delicada que as anteriores: `supabase/migrations/20261120162913_fix_exfil_trigger_urls.sql:27-33` chama a
   function com a URL em `:27` e `'Authorization', 'Bearer ' || anon_key`, onde `anon_key` é um **literal
   JWT da chave `anon` embutido em `:28`** dentro de uma função `SECURITY DEFINER`. Consequências práticas:
   (a) o trigger **não** manda o segredo de serviço hoje — se você só validar o segredo, os alertas de
   segurança param de chegar no Slack; (b) a chave literal é o achado **CRON-02**, e ela quebra quando for
   rotacionada. Portanto: escreva **uma migration nova, aditiva**, que redefina
   `internal.dispatch_security_alert_to_slack` para mandar o header do segredo em vez do `Bearer <anon>`,
   na mesma PR do gate. **Não** edite a migration antiga — é histórico já aplicado (`AGENTS.md` → Banco).
3. **Atalho tentador a evitar:** aceitar "qualquer JWT válido" (inclusive o `anon` que o trigger manda hoje)
   e declarar resolvido. A chave `anon` é publicável — está no bundle do front-end — então validar presença
   de JWT `anon` é exatamente o defeito SEC-03 (presença confundida com autorização) numa roupa nova.
4. Separe no código o ramo `record` (trigger, `:49`) do ramo `alert` (UI, `:50`): cada um exige o seu
   mecanismo. Hoje o `refine` de `:53` aceita qualquer um dos dois de qualquer chamador.

**Arquivos e objetos a tocar:** `supabase/functions/slack-alert-dispatcher/index.ts` (`:55-74` e a
discriminação `:47-53`); **uma migration nova** em `supabase/migrations/`.

**Não tocar / armadilhas:** não toque em `supabase/functions/_shared/slack.ts` (`slackApiCall`,
`buildAlertPayload`) — é compartilhado com as etapas 017, 018 e 019. Não edite
`20261120162913_fix_exfil_trigger_urls.sql`. **Não** inclua a rotação da chave `anon` nesta etapa (é outro
escopo e precisa do dono). Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31` —
mas o trigger do banco também não passa pelo gateway com JWT de usuário, então o segredo é a defesa real.

**Depende de:** 006, 007 · **Libera:** 017

**Risco e como reverter:** **alto** — se o gate subir antes da migration do trigger, os alertas de segurança
param de chegar ao Slack **sem nenhum erro visível** (o `pg_net.http_post` não trata resposta). Mergeie as
duas mudanças juntas e teste o caminho do trigger logo após o deploy. Reverter: `git revert` da PR +
`workflow_dispatch` do `Edge Deploy`; a migration nova precisa de uma segunda migration para voltar atrás.

**Precisa de aprovação humana antes do merge:** **sim** — migration em banco de produção.

**Como verificar:**

```
# (a) anônimo → 401 (hoje: 200 e a mensagem aparece no Slack)
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/slack-alert-dispatcher \
  -H "content-type: application/json" \
  -d '{"alert":{"workspace_id":"<uuid>","category":"teste","severity":"info","title":"probe"}}'
```

(b) caminho do trigger, que é o que pode quebrar: `INSERT` de uma linha de teste em `security_alerts` (em
ambiente descartável, **nunca** em produção) e confirmar que a mensagem chegou ao canal. Sem Postgres
descartável à mão, use o botão de teste da UI (`SlackTestBroadcastButton`) para provar o caminho de usuário e
registre o caminho do trigger como **verificação pendente** — não afirme que os alertas continuam chegando
sem ter visto um chegar.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 017 — `slack-dlq-retry`: autenticar o cron e o botão de reprocessamento

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (10 de 24)

**Problema hoje:** `supabase/functions/slack-dlq-retry/index.ts:54-65` — CORS (`:55`), rate limit (`:56-58`),
método (`:59`) e `createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), …)` em
`:61-65`. **Nenhuma checagem de identidade, e nem sequer um schema de corpo** — a function ignora o payload
por completo. Um POST anônimo vazio drena a fila de mensagens mortas do Slack de **todos os workspaces**:
`:67-74` lê `slack_dispatch_dlq` sem filtro de workspace (`limit(BATCH_SIZE)` = 20, `:23`) e `:86-115`
reenvia cada item ao Slack via `slackApiCall('chat.postMessage', …)` (`:88`). Isto é **republicação em massa
de mensagens antigas em canais de cliente**, acionável por qualquer um.

**Causa raiz:** a function é descrita no cabeçalho como "Cron-invoked" (`:3`) e tratada como interna. O
agendamento está em `supabase/migrations/20260722115149_be884e60-…sql:12-19`, cujo header é
`'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)` (`:19`) — e esse GUC
**nunca foi definido** (achado CRON-01), de modo que o job manda `Bearer ` vazio e só funciona porque o JWT
está desligado em todas as edges. Nunca houve credencial de verdade neste caminho.

**Caminho recomendado:**

1. Dois mecanismos: segredo de serviço (`constantTimeEqual`, `_shared/security.ts:16-27`, padrão
   `bitrix24-webhook/index.ts:89-103`) para o cron, e `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:20`) para o botão da UI (`src/components/slack/SlackDlqPanel.tsx:45`, que hoje
   invoca com `body: {}`).
2. **Faça a etapa 016 primeiro e reaproveite o gate.** As duas são da mesma integração, compartilham
   `_shared/slack.ts` e serão lidas juntas pela próxima pessoa.
3. **O passo que a etapa 016 não tem:** quando o chamador for usuário, **acrescente um escopo de workspace**.
   Hoje não há schema de corpo nenhum — então introduza um (`workspace_id` opcional, uuid), valide o
   pertencimento com `validateWorkspaceMembership` (`_shared/auth.ts:171-184`) e filtre `:67-74` por ele. No
   caminho do cron, mantenha o comportamento global (é o drenador de fila). Sem isso, o botão do painel de um
   cliente reenvia mensagens de outro.
4. A etapa 006 já decidiu o segredo dos jobs; confirme que o job de `20260722115149…:12-19` foi redefinido
   lá para mandá-lo. Se não foi, **esta etapa quebra o cron** — leia a migration nova da 006 antes de
   mergear, não depois.
5. **Atalho tentador a evitar:** definir o GUC `app.settings.service_role_key` para "fazer o header do cron
   funcionar". Resolve o sintoma e guarda a chave que ignora a RLS numa configuração de banco legível por
   qualquer superusuário, além de ter de ser refeito a cada rotação — é exatamente a opção (a) que a etapa
   006 avaliou e descartou.

**Arquivos e objetos a tocar:** `supabase/functions/slack-dlq-retry/index.ts` (`:54-74`).

**Não tocar / armadilhas:** não altere `PERMANENT_ERRORS` (`:29-45`) nem `isPermanent` (`:47-52`) — é a
lógica que drena a fila em vez de retentar para sempre. Não toque em `_shared/slack.ts`. Não edite a migration
`20260722115149_…sql`. Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 006, 007, 016 · **Libera:** —

**Risco e como reverter:** médio-alto pelo silêncio do cron (mesmo padrão da 016). Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** (a parte de migration ficou na etapa 006).

**Como verificar:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/slack-dlq-retry
-H "content-type: application/json" -d '{}'` → esperado **401** (hoje: 200 com `{"processed":N}`). Com o
segredo → 200. E confirme que o job continua rodando:
`SELECT jobname, status, start_time FROM cron.job_run_details WHERE jobname = 'slack-dlq-retry'
ORDER BY start_time DESC LIMIT 5;` — **depende de `DB_MCP_URL`**, que a auditoria não tinha
(`01-INVENTARIO.md` §6); sem ele, registre a verificação de HTTP e marque a do cron como pendente.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 018 — `slack-agent-notify`: **não tem chamador nenhum** — remover, ou fechar com segredo se o dono quiser mantê-la

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Higiene
**Achados resolvidos:** SEC-02 (11 de 24)

**Problema hoje:** `supabase/functions/slack-agent-notify/index.ts:57-81` — CORS (`:58`), rate limit
(`:59-61`), método (`:62`), zod (`:37-46`, `:64-71`), checagem do `SLACK_BOT_TOKEN` (`:73-75`) e
`createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), …)` em `:77-81`.
**Nenhuma checagem de identidade.** Qualquer pessoa que satisfaça o `PayloadSchema` (`:37-46`:
`agent_id` uuid, `workspace_id` uuid, `status`) publica no Slack do cliente uma notificação falsa de execução
de agente, com custo e duração inventados (`:41-42`).

**E o fato que define esta etapa:** **esta function não é chamada por nada.** Medido:

- `grep -rn "slack-agent-notify" src/` → **nenhuma ocorrência**;
- `grep -rn "slack-agent-notify" supabase/functions/ supabase/migrations/ scripts/ e2e/ tests/` → **nenhuma
  ocorrência** fora do próprio diretório da function.
  O cabeçalho (`:4-5`) afirma que ela é disparada "via `pg_net.http_post` from server code or triggers" — e
  **não existe no repositório nenhum trigger, job ou código que a chame**. É superfície de ataque publicamente
  alcançável, com `service_role` e com o token do Slack, servindo a zero funcionalidade.

**Causa raiz:** feature entregue pela metade — a function foi escrita e deployada, o gatilho que a usaria
nunca foi. O deploy automático de `.github/workflows/edge-deploy.yml` republica as 89 a cada push, então nada
sinaliza que uma delas é órfã.

**Caminho recomendado:**

1. **Comece confirmando o grep você mesmo**, com os dois comandos acima, no HEAD atual. Se aparecer um
   chamador que não existia na auditoria, pare e trate esta etapa como as 016/017 (segredo de serviço +
   `validateWorkspaceMembership`).
2. Confirmado o zero: **caminho (iii) — remover a function.** Apague
   `supabase/functions/slack-agent-notify/` por completo. Esta é a correção certa, e não a mais óbvia: pôr um
   gate de autenticação em código morto deixa um endpoint vivo, uma tabela (`slack_agent_notifications`,
   `:83-88`) sem consumidor e um arquivo que a próxima auditoria vai ter de reler.
3. **Antes de apagar**, leve ao dono uma pergunta de uma linha, porque é decisão de produto e não de
   engenharia: _"notificação no Slack ao fim de execução de agente nunca foi ligada — desligo de vez ou
   quero que eu ligue?"_ Se ele quiser ligar, isso é uma **etapa de funcionalidade** (precisa do gatilho, da
   tela de configuração e do segredo), não esta etapa de segurança. Não ligue por iniciativa própria: dado
   em `slack_agent_notifications` configurado por ninguém significa que ligar não produz notificação alguma.
4. Remova também a entrada correspondente do `supabase/deployment-manifest.json` **pelo gerador**, nunca à
   mão: `node scripts/edge-deploy/generate-manifest.mjs` (o arquivo tem `manifest_sha256`). Depois rode
   `node scripts/edge-deploy/generate-manifest.mjs --check` e confirme saída 0.
5. Deletar a function do repositório **não a remove de produção**: o `supabase functions deploy` do
   `scripts/deploy-edge-functions.sh` só publica o que existe, não apaga o que sumiu. Faça o delete no painel
   do Supabase (ou `npx supabase functions delete slack-agent-notify`) e **registre a confirmação** — é o
   mesmo passo que a etapa 001 faz com a `migrate-helper`, e é o que diferencia "removido do repo" de
   "removido do ar".

**Arquivos e objetos a tocar:** apagar `supabase/functions/slack-agent-notify/` (todo o diretório);
`supabase/deployment-manifest.json` (regerado); a tabela `slack_agent_notifications` fica para uma etapa de
limpeza de banco — **não** faça DDL aqui.

**Não tocar / armadilhas:** não toque em `_shared/slack.ts`, usado pelas etapas 016, 017 e 019. Não apague
a tabela `slack_agent_notifications` nesta etapa (deleção de dado exige o dono). Armadilha: a function
compartilha prefixo com `slack-agent-notify`… confira que você não está apagando `slack-alert-dispatcher`
nem `slack-rag-sync`, que **têm** chamador. Esta function **não** tem `verify_jwt = false` no
`supabase/config.toml:3-31`, logo não há entrada de config a remover.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo, dado o grep vazio. Reverter: `git revert` restaura o código, e um
`workflow_dispatch` do `Edge Deploy` o republica.

**Precisa de aprovação humana antes do merge:** **sim** — remoção de function de produção é decisão de
arquitetura/produto, e o dono precisa confirmar que a notificação no Slack não era esperada.

**Como verificar:** depois do delete em produção:
`curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/slack-agent-notify -d '{}'` → esperado
**404** (hoje: 400 por payload inválido, o que já prova que a function está no ar e processando pedido
anônimo). Registre os dois status, antes e depois. E `node scripts/edge-deploy/generate-manifest.mjs --check`
→ saída 0.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 019 — `slack-rag-sync`: autenticar antes de copiar conversas de Slack para a base de conhecimento

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (12 de 24)

**Problema hoje:** `supabase/functions/slack-rag-sync/index.ts:57-96` — CORS (`:58`), rate limit (`:59-61`),
método (`:62`), JSON (`:64-69`), zod (`:37-44`, `:70-86`), `SLACK_BOT_TOKEN` (`:88-90`) e
`createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), …)` em `:92-96`.
**Nenhuma checagem de identidade.** O `BodySchema` aceita `workspace_id` **ou** `source_id` (`:37-44`) vindos
do payload, e `:98-100` consulta `slack_rag_sources` com `service_role` a partir desses valores. Um POST
anônimo com um uuid válido dispara a sincronização de até 500 mensagens por canal (`:46`), que são
**inseridas em `agent_memories_v2`** — isto é, conteúdo de conversa de cliente entrando na base de
conhecimento por ordem de um desconhecido, consumindo cota da API do Slack.

**Causa raiz:** a mesma das 016/017 — dois modos de invocação declarados no cabeçalho (`:5-7`: cron e
manual por `{ source_id }`) e nenhum amarrado a credencial.

**Caminho recomendado:**

1. Dois mecanismos: `authenticateRequest` (`_shared/mod.ts:25`, referência `whatsapp-outbound/index.ts:20`)
   para o modo manual (`src/hooks/useSlackConfig.ts:336`) e segredo de serviço (`constantTimeEqual`,
   `_shared/security.ts:16-27`, padrão `bitrix24-webhook/index.ts:89-103`) para o cron.
2. **O ponto específico desta function é o `source_id`.** Com `workspace_id` você pode validar pertencimento
   direto (`validateWorkspaceMembership`, `_shared/auth.ts:171-184`). Com `source_id` **não dá**: o workspace
   só aparece depois de ler a linha de `slack_rag_sources` (`:98-100` seleciona `workspace_id` justamente
   por isso). Então a ordem correta é: autentique → leia a fonte com `service_role` → valide que o
   `workspace_id` **da linha lida** é um workspace do usuário → só então sincronize. Autenticar sem este
   passo intermediário não fecha nada: o `source_id` continuaria sendo a credencial de fato.
3. **Atalho tentador a evitar:** filtrar a consulta de `:98-100` por `workspace_id` do payload. Se o
   chamador escolhe os dois campos, ele escolhe também a combinação que passa no filtro. O `workspace_id`
   tem de vir do `authenticateRequest`, nunca do corpo.
4. Siga as etapas 016 e 017 antes: mesma integração, mesmo gate, mesma forma.

**Arquivos e objetos a tocar:** `supabase/functions/slack-rag-sync/index.ts` (`:57-100`).

**Não tocar / armadilhas:** não altere `sanitize` (`:49-55`) — é a redação de e-mail/telefone/cartão antes de
o texto entrar na base, e mexer nela é risco de LGPD em escopo errado. Não altere `MAX_MESSAGES_PER_RUN`
(`:46`) nem `PAGE_SIZE` (`:47`): são o limite que evita timeout. Não toque em `_shared/slack.ts`. Esta
function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 006, 007, 016 · **Libera:** —

**Risco e como reverter:** médio — o cron de sincronização para se o segredo não estiver aplicado, e a falha
aparece como "a base de conhecimento parou de receber conversas", não como erro. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/slack-rag-sync \
  -H "content-type: application/json" -d '{"source_id":"<uuid de uma fonte real>"}'
```

Esperado **401** (hoje: 200 e a sincronização acontece). Depois, com JWT de usuário do workspace A e um
`source_id` do workspace B → esperado **403**, e **nenhuma** linha nova em `agent_memories_v2` com
`source_type='slack'` daquela fonte. O segundo teste exige dois usuários e leitura de banco; sem isso
(`01-INVENTARIO.md` §6), registre o primeiro e deixe o isolamento como pendente declarado.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 020 — `bitrix24-oauth`: autenticar `authorize` por JWT e amarrar o `callback` a um `state` assinado

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Integrações
**Achados resolvidos:** SEC-02 (13 de 24)

**Problema hoje:** `supabase/functions/bitrix24-oauth/index.ts:13-26` — CORS (`:14`), rate limit (`:16-18`) e
`createClient(supabaseUrl, supabaseServiceKey)` em `:21-26`, com
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` em `:22`. **Nenhuma checagem de identidade em nenhum dos ramos.**
Três problemas concretos, em ordem de gravidade:

1. `:72-79` — depois da troca de código por token, grava em `workspace_secrets` com
   `upsert({ key_name: 'bitrix24_access_token', key_value: … })` **sem `workspace_id`**. Não é só falta de
   autenticação: o token do Bitrix24 é gravado num registro global. Num sistema multi-workspace, isso
   significa que a credencial do CRM de um cliente é a de todos.
2. `:49-85` — o ramo `callback` aceita qualquer `code` de qualquer origem; o parâmetro `state`, que existe no
   schema (`:10`) e seria a amarração entre quem iniciou e quem concluiu o fluxo, **nunca é lido nem
   validado**.
3. `:87-91` — o ramo `status` é **inalcançável**: `OAuthActionSchema` (`:6`) só admite `'authorize'` e
   `'callback'`, então `action === 'status'` nunca é verdade e `:34` já recusou com 400. Código morto.

**Causa raiz:** o fluxo OAuth foi implementado como se houvesse um único tenant. Daí tanto a ausência de
`workspace_id` no upsert quanto a ausência de `state`: sem multi-tenancy no desenho, não havia nada para
amarrar.

**Caminho recomendado:**

1. **Trate os dois ramos de forma diferente — e é por isso que o caminho "põe `authenticateRequest` no topo"
   está errado aqui:**
   - `authorize` (`:40-47`) → **(i)** `authenticateRequest` (`_shared/mod.ts:25`, referência
     `whatsapp-outbound/index.ts:9-11,20`). Quem inicia a conexão é um usuário logado na tela
     (`src/components/integrations/Bitrix24Connect.tsx`, via `src/services/llmGatewayService.ts:170`).
   - `callback` (`:49-85`) → **não pode exigir JWT**: é um **redirecionamento do navegador vindo do
     Bitrix24**, e o navegador não manda `Authorization`. A identidade tem de viajar no `state`. Gere no
     ramo `authorize` um `state` que carregue o `workspace_id` e um HMAC do servidor, acrescente-o à
     `authUrl` (`:45`, que hoje nem inclui `state`), e no `callback` verifique a assinatura com
     `verifyHmacSignature` (`_shared/security.ts:32-69`, exportado em `_shared/mod.ts:64`) antes de trocar o
     código.
2. Com o `workspace_id` recuperado do `state`, **corrija os upserts de `:72-79`** para incluí-lo. Esta é a
   parte que de fato protege o dado; sem ela, autenticar o `authorize` só muda quem pode iniciar o fluxo.
3. Apague o ramo morto `:87-91` ou acrescente `'status'` ao enum de `:6` — escolha uma, não deixe as duas.
   Se escolher manter, `status` também exige JWT.
4. **Atalho tentador a evitar:** pôr `verify_jwt = false` para esta function no `config.toml` "porque o
   callback é um redirect". Isso reabre `authorize` e `status` para o mundo e torna a etapa 007 inócua
   justamente onde há `service_role`. O `state` assinado resolve o callback sem abrir o resto.

**Arquivos e objetos a tocar:** `supabase/functions/bitrix24-oauth/index.ts` (`:6-11` schema, `:13-26`
entrada, `:40-47` authorize, `:49-85` callback, `:87-91` ramo morto).

**Não tocar / armadilhas:** não toque em `supabase/functions/bitrix24-webhook/index.ts` — é outra function,
**já tem** validação (`:89-103`) e é a sua referência de padrão, não um alvo. Armadilha de configuração: a
`redirect_uri` é montada em `:44` e `:56` e tem de bater **exatamente** com a registrada no painel do
Bitrix24; se você acrescentar `state` como parte da URL de redirect (em vez de parâmetro do
`/oauth/authorize/`), a troca de token falha com erro genérico. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio — mexe num fluxo OAuth de terceiro, cuja falha só aparece quando alguém
tenta conectar. Se já houver um token gravado e funcionando, a correção do `workspace_id` em `:72-79` cria
uma linha nova e a antiga (sem workspace) fica órfã: decida com o dono se ela deve ser migrada ou refeita
pela tela. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **sim** — altera onde a credencial do CRM é gravada, com
efeito sobre o dado já existente em `workspace_secrets`.

**Como verificar:**

```
# (a) authorize sem JWT → 401 (hoje: 200 com a auth_url)
curl -s -o /dev/null -w "%{http_code}\n" ".../functions/v1/bitrix24-oauth?action=authorize"
# (b) callback com code inventado e sem state válido → 400 (hoje: tenta a troca de token e devolve 502)
curl -s -o /dev/null -w "%{http_code}\n" ".../functions/v1/bitrix24-oauth?action=callback&code=xyz"
```

(c) fluxo real: conecte pela tela e confirme que a linha de `workspace_secrets` criada tem `workspace_id`
preenchido. O (c) precisa de credencial de aplicação e de leitura do banco — se faltar algum dos dois
(`01-INVENTARIO.md` §6), registre (a) e (b) e declare (c) pendente.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 021 — `health-check`: exigir JWT e parar de usar `service_role` para um ping

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (14 de 24)

**Problema hoje:** `supabase/functions/health-check/index.ts:5-24` — é a function mais curta das 24 (55
linhas) e também não verifica nada: CORS (`:6-7`), rate limit (`:9-11`) e, dentro do `try`,
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` em `:20` com `createClient(supabaseUrl, serviceKey)` em `:24`.
O que ela faz com essa chave: `supabase.from('workspaces').select('id').limit(1)` (`:25`). Ou seja, usa a
credencial que ignora toda a RLS para provar que o banco responde. E expõe publicamente, sem login, o estado
e a latência da infraestrutura (`:42-53`), incluindo `error.message` do Postgres em `:29` — mensagem de erro
de banco devolvida a um anônimo.

**Causa raiz:** "health check tem de ser público" foi aplicado sem distinguir _quem_ precisa dele. O
consumidor real é a tela de monitoramento da área logada, não um balanceador externo — mas a function foi
escrita no formato de um endpoint de infraestrutura e ganhou a chave mais forte disponível por conveniência.

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:20`). Verificado que isso é seguro: o único consumidor é
   `src/services/healthService.ts:42`, usado por `src/components/shared/SystemHealthBanner.tsx:33`, que é
   montado **apenas** em `src/pages/MonitoringPage.tsx:199` — rota da área logada. Nenhuma tela pública
   depende desta function.
2. **Troque a chave, não só adicione o gate.** Depois de autenticar, use o cliente do usuário
   (`supabase`, não `supabaseAdmin`, ambos devolvidos pelo `authenticateRequest` — `_shared/auth.ts:11-17`).
   A consulta de `:25` só precisa provar conectividade; com o cliente do usuário ela continua provando, e a
   `service_role` deixa de existir nesta function. É o tipo de redução de superfície que vale mais que o
   gate: uma function a menos na lista das que carregam a chave total.
3. **Atalho tentador a evitar:** manter a function aberta e "só tirar a mensagem de erro de `:29`". O que
   vaza em `:29` é o menor dos problemas; o que importa é a `service_role` num endpoint anônimo e o oráculo
   de disponibilidade. De todo modo, troque `error.message` por um rótulo fixo — mensagem de Postgres não
   vai para a resposta HTTP nem para usuário autenticado.
4. Confirme que `healthService.ts:42-67` trata o 401 sem encher o log: ele já tem supressão de log repetido
   (`:49-57`), mas se a sessão expirar o banner passa a falhar — verifique que o componente mostra estado de
   erro e não uma tela quebrada.

**Arquivos e objetos a tocar:** `supabase/functions/health-check/index.ts` (`:5-31`).

**Não tocar / armadilhas:** não acrescente novos `checks` ao objeto (`:14`, `:36`) — escopo é autenticação,
não cobertura de monitoramento. Armadilha: `synthetic-runner` tem um target chamado `health` (`:60-66` dessa
function), mas ele aponta para `${SUPABASE_URL}/rest/v1/`, **não** para `health-check` — não há dependência
entre as duas, e tratá-las como ligadas leva a "proteger" a errada. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo. Único risco real: se existir um monitor externo (UptimeRobot e afins)
apontado para esta URL, ele passa a receber 401 — pergunte ao dono antes do merge, porque isso não está no
repositório e nenhum grep acha. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** — mas inclua no corpo da PR a pergunta sobre monitor
externo.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" .../functions/v1/health-check     # esperado 401 (hoje: 200)
curl -s .../functions/v1/health-check -H "Authorization: Bearer <JWT válido>"  # 200, status healthy
```

E confirme que o corpo da resposta autenticada **não** traz mais `checks.database.error` com texto do
Postgres. Abra `/monitoring` na aplicação e confirme que o banner continua funcionando — isso exige
credencial de usuário, que a auditoria não tinha (`01-INVENTARIO.md` §6); se você também não tiver, registre
os dois `curl` e marque a confirmação de tela como pendente.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 022 — `workflow-engine-v2`: parar de fabricar credencial `anon` quando o chamador não se identifica

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge)
**Achados resolvidos:** SEC-02 (15 de 24)

**Problema hoje:** `supabase/functions/workflow-engine-v2/index.ts:75-89` — CORS (`:76`), rate limit
(`:79-81`) e então:

```ts
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!; // :85
const authHeader = req.headers.get('Authorization') || `Bearer ${supabaseKey}`; // :86
const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { headers: { Authorization: authHeader } },
}); // :87-89
```

**Nenhuma checagem de identidade**, e `:86` é a mesma forma do SEC-05 (`a2a-server:235`): ausência de
credencial tratada como credencial `anon` válida. O `authHeader` fabricado é depois repassado a cada nó do
grafo que chama outra function (`:197`, `:270`, `:298`, `:331`), propagando a identidade inventada por todo
o motor de workflow.

**Severidade Alta e não Crítica por uma razão específica, que você precisa saber antes de escolher a
correção:** esta function **não usa `SUPABASE_SERVICE_ROLE_KEY` em lugar nenhum** (medido:
`grep -c "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/workflow-engine-v2/index.ts` → **0**). Ela opera com
a chave `anon`, então a RLS **é** aplicada. Um chamador anônimo consegue executar exatamente os workflows que
a política de RLS liberar para `anon` — se a RLS estiver correta, nada; se não estiver, tudo. Como a RLS não
pôde ser verificada nesta auditoria (`01-INVENTARIO.md` §6, e o teste de RLS nunca roda — achado
RLS-TEST-01), **o alcance real é desconhecido**. Corrija o código de qualquer forma: depender da RLS como
única defesa é exatamente a aposta que o achado RLS-TEST-01 diz que ninguém está verificando.

**Causa raiz:** o autor quis que a function funcionasse tanto com JWT de usuário quanto sem, e resolveu com
um default em vez de uma decisão. O default escolhido foi "continue".

**Caminho recomendado:**

1. **Apague o `|| \`Bearer ${supabaseKey}\``de`:86`.** Sem `Authorization`→ 401, antes de`:91`.
2. Troque o bloco `:84-89` por `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:9-11,20`) e use o `supabase` que ele devolve (`_shared/auth.ts:44-46`: já é o
   cliente `anon` com o header do usuário — **exatamente** o que `:87-89` monta à mão, só que com o token
   validado). A mudança é pequena de propósito: o padrão já existe, a function já estava quase nele.
3. Nos pontos `:197`, `:270`, `:298` e `:331`, continue repassando o `authHeader` — mas agora ele é o token
   real do usuário, e as functions-alvo passam a ver a identidade certa. **Não** troque esses repasses por
   `service_role`: seria "consertar" o problema transformando-o no SEC-04.
4. **Atalho tentador a evitar:** trocar a chave `anon` de `:85` por `service_role` para "garantir que o motor
   consiga ler tudo que precisa". É a troca errada, e tentadora porque faz workflows que falham por RLS
   passarem a funcionar. Se um workflow falha por RLS, o defeito é a policy ou o dono do workflow — não a
   chave do motor.

**Arquivos e objetos a tocar:** `supabase/functions/workflow-engine-v2/index.ts` (`:75-89` e, se necessário,
os repasses de `authHeader` em `:197`, `:270`, `:298`, `:331`).

**Não tocar / armadilhas:** não toque na execução do grafo (`:99-516`), nem no `WorkflowInput` (`:69-73`),
nem no `deliverWebhook`. Armadilha de streaming: `:97` decide modo SSE por `accept: text/event-stream`; se o
seu 401 sair depois desse ponto, o cliente em modo stream recebe um corpo que não é SSE e quebra de forma
confusa — devolva o 401 **antes** de `:91`. Atenção aos chamadores: `src/services/workflowsService.ts:196`
usa `fetch` direto na URL (não `functions.invoke`), então **não** herda o header de autorização
automaticamente — confirme que esse `fetch` manda `Authorization`, senão a tela de workflows quebra no
merge. `workflowsService.ts:260` e `src/services/approvalService.ts:27` usam `functions.invoke` e herdam.
Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio — é o motor de workflow, e o `fetch` direto de `workflowsService.ts:196` é
o ponto onde isso pode quebrar na UI. Teste a tela antes do merge. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/workflow-engine-v2 \
  -H "content-type: application/json" \
  -d '{"workflow_id":"00000000-0000-0000-0000-000000000000","input":""}'
```

Esperado **401**. Hoje devolve **404** (`Workflow not found`, `:105`) — e esse 404 é a prova de que a
requisição anônima chegou a consultar o banco. Registre a mudança de 404 para 401. Depois, com JWT válido e
um `workflow_id` real, confirme execução normal e
`npx vitest run src/test/workflow-tracer.test.ts`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 023 — `agent-conversational-builder`: exigir JWT antes de chamar a OpenRouter

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** SEC-02 (16 de 24)

**Problema hoje:** `supabase/functions/agent-conversational-builder/index.ts:50-60` — CORS (`:51-52`), rate
limit (`:54-56`) e, dentro do `try`, `Deno.env.get(AI_API_KEY_ENV)` em `:59`. **Nenhuma checagem de
identidade.** O corpo aceita até 100 mensagens de conteúdo livre (`:14-24`), e a function as envia à
OpenRouter com a chave do dono (`AI_CHAT_COMPLETIONS_URL` / `AI_API_KEY_ENV` importados de
`../_shared/ai-provider.ts` em `:10`). Resultado: **um endereço público que converte o saldo de IA do dono em
respostas de LLM para qualquer um**, com `SYSTEM_PROMPT` fixo (`:29-48`) mas mensagens inteiramente
controladas pelo chamador.

Não usa `service_role` (medido: 0 ocorrências de `SUPABASE_SERVICE_ROLE_KEY`), por isso Alta e não Crítica —
o dano é financeiro e de abuso, não de dado.

**Causa raiz:** a function foi tratada como "só um proxy de chat do assistente de criação de agente", e o
único freio posto foi o rate limit de `:55` (`RATE_LIMITS.heavy`). Esse freio é ilusório: ele vive em
`new Map()` na memória do isolate (`_shared/rate-limiter.ts:40`), que em Edge Functions é efêmero e
replicado — o contador reinicia e não é compartilhado entre instâncias (achado RATE-01).

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:9-11,20`). Chamador único:
   `src/components/agent-builder/ConversationalBuilder.tsx:69`, que faz `fetch` direto na URL — **confira
   que esse `fetch` envia `Authorization` com a sessão**; como não usa `functions.invoke`, ele não herda o
   header, e se não enviar, a tela quebra no merge. Se faltar, acrescente no mesmo PR.
2. Ponha o gate **antes de `:59`**, não depois do parse: o que se quer impedir é a chamada paga, e ela
   começa em `:59`.
3. Depois de autenticar, troque o identificador do rate limit: hoje `getRateLimitIdentifier(req)` (`:54`) cai
   para IP (`_shared/rate-limiter.ts:63`); passe o `user.id` como segundo argumento
   (`getRateLimitIdentifier(req, user.id)`, assinatura em `_shared/rate-limiter.ts:57`). O padrão já existe
   no repositório, com o motivo escrito: `supabase/functions/skill-describe-llm/index.ts:242-244`.
4. **Atalho tentador a evitar:** apertar o rate limit e considerar resolvido. Pelo RATE-01, o contador é por
   isolate — apertar o número não muda a natureza do freio. Autenticação é o que amarra o gasto a uma pessoa.

**Arquivos e objetos a tocar:** `supabase/functions/agent-conversational-builder/index.ts` (`:50-60`);
eventualmente `src/components/agent-builder/ConversationalBuilder.tsx:69` (só o header, se faltar).

**Não tocar / armadilhas:** não altere o `SYSTEM_PROMPT` (`:29-48`) nem o `BuilderBodySchema` (`:12-27`).
**Armadilha de escopo:** esta é uma das 7 functions que gastam LLM fora do `llm-gateway` (achado COST-01) —
**a correção de orçamento é outra etapa, na faixa 039-045**. Aqui, só autenticação. Não tente, de passagem,
redirecionar a chamada para o `llm-gateway`: isso muda o caminho de custo e o comportamento do assistente, e
misturado com o gate de auth fica impossível reverter uma coisa sem a outra. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo, exceto pelo `fetch` direto do passo 1. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/agent-conversational-builder \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"oi"}]}'
```

Esperado **401**, e — o que importa — **sem chamada registrada na OpenRouter**. Hoje a mesma requisição
devolve 200 e consome crédito. Repita com JWT válido → 200. Abra o construtor conversacional na aplicação e
confirme que a conversa continua funcionando (exige credencial de usuário, que a auditoria não tinha —
`01-INVENTARIO.md` §6; se faltar, registre os dois `curl` e marque a tela como pendente).

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 024 — `quick-agent-test`: exigir JWT antes de executar prompt arbitrário do chamador

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** SEC-02 (17 de 24)

**Problema hoje:** `supabase/functions/quick-agent-test/index.ts:56-74` — CORS (`:57`, `:59`), rate limit
(`:61-63`), método (`:66-68`) e zod (`:14-33`, `:70-74`). **Nenhuma checagem de identidade.** E o payload é
mais permissivo que o da etapa 023: `system_prompt` é **string livre de até 20.000 caracteres** (`:15`),
`user_message` até 4.000 (`:16`) e `model` é escolhido pelo chamador (`:17`), mapeado em `mapModel`
(`:45-54`) para modelos da família Gemini/GPT. Com a chave do dono (`AI_API_KEY_ENV`, importado em `:13`),
isto é **um proxy genérico de LLM aberto na internet**: quem chamar define prompt de sistema, mensagem e
modelo. É a pior das 7 do COST-01 sob esse ângulo, porque nem o papel do assistente é fixo.

Não usa `service_role` (0 ocorrências) → Alta.

**Causa raiz:** a funcionalidade legítima ("testar o agente antes de salvar", `:34-35`) exige que o
`system_prompt` venha do cliente, já que o agente ainda não existe no banco. Isso é correto — mas transformou
o endpoint num proxy de LLM, e nada foi posto no lugar da identidade.

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:9-11,20`), com o gate **antes do `req.json()` de `:70`**.
2. Troque o identificador do rate limit para o usuário autenticado:
   `getRateLimitIdentifier(req, user.id)` (`_shared/rate-limiter.ts:57-64`), padrão já escrito e justificado
   em `skill-describe-llm/index.ts:242-244`. Aqui isso vale mais que nas outras: com prompt livre, o limite
   por IP é contornável trocando de IP, e o limite por isolate nem existe de verdade (RATE-01).
3. Confira os três chamadores e, em especial, o `fetch` direto:
   `src/components/agents/wizard/quickSteps/RealExamplePreview.tsx:131` monta a URL à mão (com um fallback
   `'https://<project>.supabase.co'` que é literal de placeholder — se essa linha chegar a executar, a
   chamada vai para um host inexistente); `:161` e
   `src/components/agents/wizard/quickSteps/QuickAgentTestPanel.tsx:125` usam `functions.invoke` e herdam a
   sessão. Garanta que o `fetch` de `:131` mande `Authorization`.
4. **Atalho tentador a evitar:** restringir `system_prompt` (allowlist, tamanho menor, validação de
   conteúdo) como substituto da autenticação. Não funciona: a funcionalidade **precisa** de prompt livre, e
   qualquer filtro que você escreva é contornável. O que fecha o abuso é "só usuário logado pode gastar", não
   "só prompts aprovados".

**Arquivos e objetos a tocar:** `supabase/functions/quick-agent-test/index.ts` (`:56-74`); eventualmente
`src/components/agents/wizard/quickSteps/RealExamplePreview.tsx:131` (só o header).

**Não tocar / armadilhas:** não altere `mapModel` (`:45-54`) nem `appendSkillsToPrompt` /
`countInjectedSkills` (`_shared/skills.ts`, importados em `:12`) — o segundo é compartilhado. Não mexa no
comentário de `:18-21` sobre re-sanitização de skills no servidor: é decisão de segurança já tomada.
**Armadilha de escopo:** uma das 7 do COST-01 — **orçamento é a faixa 039-045**, aqui só autenticação.
Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo, exceto pelo `fetch` direto de `RealExamplePreview.tsx:131`. Reverter:
`git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/quick-agent-test \
  -H "content-type: application/json" \
  -d '{"system_prompt":"voce e um assistente","user_message":"oi","model":"gpt-4o"}'
```

Esperado **401** e nenhuma chamada na OpenRouter. Hoje: 200 com a resposta do modelo. Repita com JWT válido → 200. Na aplicação, o passo "ver exemplo real" do wizard de agente tem de continuar funcionando.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 025 — `skill-classify-llm`: **já autentica** — confirmar, corrigir a lista do achado e fechar o escopo de workspace

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** SEC-02 (18 de 24) — **parcialmente refutado, ver abaixo**

**Problema hoje:** **HIPÓTESE — NÃO VERIFICADO.** A evidência do achado SEC-02 **não bate com o código
atual**. O achado lista `skill-classify-llm` entre as 24 functions "sem nenhum mecanismo de autenticação do
chamador", mas ao abrir o arquivo encontrei o oposto:

```ts
// supabase/functions/skill-classify-llm/index.ts:132-134
// verify_jwt = false é o padrão do deploy; a validação é feita aqui.
const userId = await getAuthUserId(req);
if (!userId) return json({ error: 'Não autenticado' }, 401, corsHeaders);
```

`getAuthUserId` é importado em `:25` do barril `_shared/mod.ts` e implementado em `_shared/auth.ts:128-140`:
monta um cliente com o header recebido e chama `supabase.auth.getUser()`, devolvendo `null` se o token for
inválido. **Isto é validação de token, não checagem de presença** — não é o padrão do SEC-03. O comentário de
`:132` mostra, ainda, que o autor sabia do `--no-verify-jwt` e compensou no código.

Por que o achado errou: a varredura do SEC-02 procurou por `auth.getUser`, `authenticateRequest`,
`hmacSha256Hex`, `constantTimeEqual`, `x-access-key`, `CRON_SECRET`, `WEBHOOK_SECRET`, `x-signature`,
`x-hub-signature`, `x-slack-signature`, `SIGNING_SECRET` e `verify_token` — **`getAuthUserId` não está na
lista**, e é por isso que três functions (esta, a 026 e a 028) entraram como falso positivo. O número real de
functions sem autenticação própria é **21**, não 24 — o que, aliás, coincide com a contagem do agente de
inventário da camada edge registrada no próprio achado.

O que **continua** sendo defeito, e é o trabalho desta etapa:

- `getAuthUserId` responde "é um usuário logado", não "é um usuário autorizado a isto". Não resolve
  workspace: `_shared/auth.ts:128-140` nem consulta `workspace_members`.
- A function gasta LLM (importa `AI_API_KEY_ENV` / `AI_CHAT_COMPLETIONS_URL` de `../_shared/ai-provider.ts`)
  — é uma das 7 do COST-01 — e qualquer usuário logado de qualquer workspace pode consumir crédito à
  vontade, limitado só pelo rate limit por isolate (RATE-01).
- Não usa `SUPABASE_SERVICE_ROLE_KEY` (medido: 0 ocorrências) → **Alta**, não Crítica.

**Causa raiz:** uma varredura por nomes de símbolo produziu uma lista, e a lista virou verdade sem que cada
item fosse aberto. É a mesma causa raiz A da auditoria ("o declarado não é o que está em execução"),
aplicada ao próprio relatório.

**Caminho recomendado:**

1. **Comece confirmando o que está escrito acima**, abrindo `:126-139` do arquivo. Se bater, **não escreva
   um gate novo** — a function já tem um.
2. Corrija o registro: marque no arquivo de progresso que `skill-classify-llm` **não** era um caso de
   ausência de autenticação, e anote a contagem correta (21). Um executor futuro que leia "24 functions
   abertas" e encontre 21 vai desconfiar do plano inteiro.
3. O trabalho real: acrescente escopo de workspace. Troque `getAuthUserId` por `authenticateRequest`
   (`_shared/mod.ts:25`, referência `whatsapp-outbound/index.ts:9-11,20`), que devolve `user`, os dois
   clientes e `workspaceId` de uma vez (`_shared/auth.ts:119-122`), e use o `workspaceId` para limitar quem
   pode classificar. **Mantenha o identificador de rate limit por usuário de `:138`** — o comentário de
   `:136-137` explica a razão (não agrupar curadores atrás do mesmo NAT) e ela continua válida.
4. **Atalho tentador a evitar:** reescrever a function "para ficar igual às outras 21". Ela já está
   mais correta que elas; um diff grande aqui é churn puro e arrisca perder as decisões de segurança
   documentadas em `:10-18` (sanitização do texto de terceiros, validação do veredito contra a taxonomia no
   servidor, propagação de 429/402). Diff mínimo: trocar duas linhas de auth e usar o workspace.

**Arquivos e objetos a tocar:** `supabase/functions/skill-classify-llm/index.ts` (`:25` import, `:132-139`).

**Não tocar / armadilhas:** não altere `sanitize` (`:64-73`), o `SYSTEM_PROMPT` (`:75-91`) nem o
`CLASSIFY_TOOL` (`:93-…`) — há teste de paridade que falha se a taxonomia divergir
(`src/test/skill-departments-parity.test.ts:30,38`, que lê
`supabase/functions/skill-classify-llm/departments.ts`). **Armadilha de escopo:** uma das 7 do COST-01 —
**orçamento é a faixa 039-045**. Esta function **não** tem `verify_jwt = false` no
`supabase/config.toml:3-31` — apesar do que o comentário de `:132` afirma. Depois da etapa 007 ela passa a
ter também o gate do gateway; o comentário fica desatualizado e deve ser corrigido nesta PR.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/skill-classify-llm \
  -H "content-type: application/json" -d '{"name":"teste"}'
```

Esperado **401** — e **esse já é o resultado hoje**; registre isso como a confirmação de que o achado era
falso positivo. Depois: `npx vitest run src/test/skill-departments-parity.test.ts` e
`npx eslint supabase/functions/skill-classify-llm/index.ts`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 026 — `skill-describe-llm`: **já autentica** — mesma correção de registro e de escopo da 025

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** SEC-02 (19 de 24) — **parcialmente refutado, ver abaixo**

**Problema hoje:** **HIPÓTESE — NÃO VERIFICADO.** Como na etapa 025, a evidência do SEC-02 não bate com o
código. `supabase/functions/skill-describe-llm/index.ts:238-240`:

```ts
// verify_jwt = false é o padrão do deploy; a validação é feita aqui.
const userId = await getAuthUserId(req);
if (!userId) return json({ error: 'Não autenticado' }, 401, corsHeaders);
```

`getAuthUserId` importado em `:33` (barril `_shared/mod.ts`, implementação `_shared/auth.ts:128-140`), com
validação real do token. E `:244` já usa `getRateLimitIdentifier(req, userId)` — limite por usuário, com a
justificativa escrita em `:242-243`. A function **não** usa `SUPABASE_SERVICE_ROLE_KEY` (0 ocorrências) →
**Alta**.

O que resta de defeito é o mesmo da 025: identidade sem workspace, e gasto de LLM
(`AI_API_KEY_ENV` em `:38`, chamada em `:295-300`) acessível a qualquer usuário logado.

**Causa raiz:** idêntica à 025 — `getAuthUserId` fora da lista de símbolos da varredura do SEC-02.

**Caminho recomendado:**

1. Confirme `:232-245` antes de qualquer edição. Registre no progresso que era falso positivo.
2. **Faça a etapa 025 antes e aplique aqui exatamente a mesma mudança.** As duas functions são gêmeas no
   desenho (mesmo comentário, mesma forma de gate, mesmo `DESCRIBE_RATE_LIMIT`/`CLASSIFY_RATE_LIMIT`); fazer
   diferente nas duas é criar divergência onde há paridade.
3. Troque `getAuthUserId` por `authenticateRequest` e use o `workspaceId` devolvido. Mantenha o
   `getRateLimitIdentifier(req, userId)` de `:244`, só trocando a origem do id para o `user.id` do helper.
4. **Atalho tentador a evitar:** o mesmo da 025 — reescrever a function. E um específico daqui: não remova
   o curto-circuito de `:279-281` (`if (readme.length < 30 && tags.length === 0 && repo.length === 0)`), que
   evita gastar uma chamada paga quando não há sinal. É controle de custo já implementado; apagá-lo
   "simplificando" piora exatamente o que a faixa 039-045 vai tentar melhorar.

**Arquivos e objetos a tocar:** `supabase/functions/skill-describe-llm/index.ts` (`:33` import, `:238-245`).

**Não tocar / armadilhas:** não altere `sanitize`, os limites `MAX_*`, nem o formato da resposta — há teste
de paridade com o código do front: `src/test/skill-description-parity.test.ts:8,14` lê este arquivo e o
compara com `src/lib/skills/descriptionEnrichment.ts:201,213`. Mexer no contrato quebra os dois lados.
**Armadilha de escopo:** uma das 7 do COST-01 — **orçamento é 039-045**. Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`; corrija o comentário de `:238` nesta PR.

**Depende de:** 007, 025 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/skill-describe-llm
-H "content-type: application/json" -d '{"name":"teste"}'` → **401**, que já é o comportamento de hoje
(registre como confirmação do falso positivo). Depois:
`npx vitest run src/test/skill-description-parity.test.ts`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 027 — `cost-calculator`: exigir JWT — a `service_role` está aqui, escondida atrás de `createAdminClient()`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-02 (20 de 24)

**Problema hoje:** `supabase/functions/cost-calculator/index.ts:38-50` — CORS (`:39`), rate limit (`:41-42`),
`parseBody` com o `CostRequestSchema` (`:21-25`, `:45-46`) e então `createAdminClient()` em `:50`.
**Nenhuma checagem de identidade.**

**Atenção a este ponto, porque ele muda a severidade e é fácil de errar:** um `grep` por
`SUPABASE_SERVICE_ROLE_KEY` **neste arquivo não acha nada** — e por isso a function pode parecer de baixo
risco. Mas `createAdminClient` é importado em `:6` do barril `_shared/mod.ts:27` e implementado em
`_shared/auth.ts:55-64`:

```ts
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
...
return createClient(supabaseUrl, supabaseServiceKey);
```

Ou seja: **esta function usa `service_role`**, só que por helper. É a única das 24 nessa situação, e é a
razão de ela ser **Crítica** e não Alta. Com essa chave ela lê a tabela `model_pricing` (`:51-55`) — a
tabela de preços de modelo do negócio, exposta a quem chamar.

**Causa raiz:** o helper `createAdminClient()` torna o uso do privilégio máximo tão barato de escrever quanto
um cliente comum, e não há nada no nome que lembre o autor de estabelecer identidade antes.

**Caminho recomendado:**

1. Mecanismo **(i)**: `authenticateRequest` (`_shared/mod.ts:25`, referência
   `whatsapp-outbound/index.ts:9-11,20`), com o gate **antes de `:45`**.
2. **Elimine o `createAdminClient()` de `:50`.** A consulta de `:51-55` lê preços de modelo, não dado de
   usuário: use o cliente do chamador devolvido pelo `authenticateRequest` (`_shared/auth.ts:11-17`) e deixe
   a RLS de `model_pricing` decidir. Se a leitura falhar por RLS, o defeito é a policy da tabela — registre e
   trate em etapa de banco, **não** volte para a `service_role`.
3. São **quatro** chamadores no front; confira todos antes do merge, porque dois usam `fetch` direto e não
   herdam header:
   - `src/hooks/useCostEstimate.ts:63` — `functions.invoke` (herda);
   - `src/services/costCalculatorService.ts:123` — `functions.invoke` (herda);
   - `src/lib/otel-genai.ts:93` — **`fetch` direto**;
   - `src/lib/llmPricing.ts:78` — `functions.invoke`, em arquivo marcado `DEPRECATED` (`:3`).
     O de `otel-genai.ts:93` roda em caminho de telemetria; se ele passar a receber 401 e o código tratar isso
     como falha silenciosa, o custo deixa de ser estimado **sem erro visível**. Note que `:107` já tem fallback
     para estimativa local — confirme que o fallback cobre o 401.
4. **Atalho tentador a evitar:** deixar aberto "porque só devolve preço público". Não é só isso: devolve o
   conteúdo de `model_pricing` lido com privilégio total, e `:36` fixa `USD_TO_BRL = 5.75` — a composição de
   preço do produto. E o argumento "é público" nunca justifica manter a `service_role` no caminho.

**Arquivos e objetos a tocar:** `supabase/functions/cost-calculator/index.ts` (`:38-55`); eventualmente
`src/lib/otel-genai.ts:93` (só o header).

**Não tocar / armadilhas:** não altere `DEFAULT_PRICING` (`:27-34`) nem `USD_TO_BRL` (`:36`) — são o achado
COST-03 (cálculo duplicado em dois lugares com unidades diferentes) e têm etapa própria; mudar o número aqui
altera valor mostrado ao cliente. Não mexa em `src/lib/llmPricing.ts` além do necessário: está deprecado e
tem remoção própria. Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio, pelo caminho de telemetria do passo 3. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/cost-calculator \
  -H "content-type: application/json" \
  -d '{"model":"gpt-4o","inputTokens":1000,"outputTokens":1000}'
```

Esperado **401** (hoje: 200 com o custo calculado a partir de `model_pricing`). Com JWT válido → 200 e o
mesmo valor de antes — compare os dois corpos para provar que a troca de `createAdminClient()` pelo cliente
do usuário **não** mudou o resultado. Rode também
`npx vitest run src/test` filtrando os testes que tocam `costCalculatorService` e `useCostEstimate`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 028 — `geo-code`: **já autentica em cascata** — confirmar, corrigir o comentário mentiroso e decidir se a function tem dono

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Higiene
**Achados resolvidos:** SEC-02 (21 de 24) — **refutado, ver abaixo**

**Problema hoje:** **HIPÓTESE — NÃO VERIFICADO.** O achado SEC-02 lista `geo-code` entre as functions sem
autenticação. O código diz o contrário, e com a cascata mais completa das 24
(`supabase/functions/geo-code/index.ts:50-59`):

```ts
// Auth em cascata: X-API-Key → JWT de usuário → membro do workspace.
const claims = await validateApiKey(req);
let userId: string | null = null;
if (!claims.valid) userId = await getAuthUserId(req);
if (!claims.valid && !userId) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: corsHeaders,
  });
}
```

`validateApiKey` (`_shared/auth.ts:146-166`) compara SHA-256 em tempo constante contra `api_keys`;
`getAuthUserId` (`_shared/auth.ts:128-140`) valida o token de verdade. Não usa
`SUPABASE_SERVICE_ROLE_KEY` (0 ocorrências). **Esta é, na prática, a referência de cascata correta do
repositório** — é dela que a etapa 011 (`a2a-server`) deve copiar a forma.

Mesma causa do falso positivo das 025/026: `getAuthUserId` e `validateApiKey` ficaram de fora da lista de
símbolos da varredura.

**O que de fato está errado aqui, e é o trabalho desta etapa, são duas coisas menores:**

1. `:15` — o cabeçalho afirma `verify_jwt=true (default). Origens: usuário autenticado ou X-API-Key ativa.`
   **É falso**: `scripts/deploy-edge-functions.sh:23` deploya as 89 com `--no-verify-jwt`. O comentário
   descreve uma garantia que não existe, e é o tipo de frase que faz a próxima pessoa confiar no gateway e
   tirar a checagem do código. Depois da etapa 007 ele passa a ser verdade — então ou a PR entra **depois**
   da 007, ou o comentário é reescrito para dizer o que é verdade hoje.
2. O comentário promete **três** níveis ("… → membro do workspace") e o código tem **dois**: o
   `workspace_id` existe no schema (`:36`) e **nunca é usado** — não há nenhuma validação de pertencimento
   no arquivo. A terceira cláusula é ficção.
3. **Ninguém chama esta function.** Medido: `grep -rn "geo-code" src/` → nenhuma ocorrência;
   `grep -rn "geo-code" supabase/functions/ supabase/migrations/ scripts/ e2e/ tests/` → só
   `supabase/functions/_shared/edge-contract_test.ts:67-68`, que é teste de contrato, não chamador.

**Causa raiz:** comentário escrito na intenção, não no efeito — a mesma causa raiz A da auditoria, em escala
de uma linha.

**Caminho recomendado:**

1. Confirme `:50-59` e os greps acima antes de editar.
2. **Decida com o dono, em uma pergunta:** _"a geocodificação de endereço não é usada por nenhuma tela —
   removo ou vai ser ligada?"_. Se a resposta for remover, siga o **caminho (iii)** no molde da etapa 018:
   apagar `supabase/functions/geo-code/` (inclusive `geo.ts`), regerar o manifest com
   `node scripts/edge-deploy/generate-manifest.mjs`, remover o caso de
   `_shared/edge-contract_test.ts:67-68` e **apagar a function em produção** (o deploy não remove o que
   sumiu do repositório). Se for mantida, siga o passo 3.
3. Se mantida: corrija `:15` para refletir o deploy real e implemente de fato o terceiro nível que o
   comentário promete — quando `claims.valid`, use o `claims.workspaceId` devolvido por `validateApiKey`;
   quando for JWT, resolva o workspace com `authenticateRequest` e valide contra o `workspace_id` do payload
   (`:36`) com `validateWorkspaceMembership` (`_shared/auth.ts:171-184`). **Corrigir o comentário sem
   implementar o nível é só mover a mentira de lugar.**
4. **Atalho tentador a evitar:** apagar o `workspace_id` do schema (`:36`) para "o comentário ficar certo".
   Isso remove a única pista de que o isolamento era pretendido, e `SCHEMA` é `.strict()` (`:38`) — um
   chamador que hoje envia o campo passa a receber 422.

**Arquivos e objetos a tocar:** `supabase/functions/geo-code/index.ts` (`:15` comentário, `:50-59` cascata,
`:36` uso do `workspace_id`) — **ou** a remoção completa do diretório `supabase/functions/geo-code/` mais
`supabase/deployment-manifest.json` (regerado) e `supabase/functions/_shared/edge-contract_test.ts:67-68`.

**Não tocar / armadilhas:** não toque em `geo-code/geo.ts` (`mapboxGeocode`, `googleGeocode` e os reversos)
se a function for mantida. Armadilha: os secrets `GOOGLE_MAPS_API_KEY` e `MAPBOX_ACCESS_TOKEN` são aplicados
pelo `.github/workflows/edge-deploy.yml:59-60`; se a function for removida, esses dois secrets ficam órfãos —
**não** os apague na mesma PR (mexer em segredo é etapa com aprovação do dono). Esta function **não** tem
`verify_jwt = false` no `supabase/config.toml:3-31`, ao contrário do que o comentário `:15` sugere ao dizer
"default".

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo nos dois caminhos, dado o grep vazio. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **sim** se o caminho for remoção (remover function de
produção é decisão de produto); **não** se for só corrigir comentário e implementar o escopo.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/geo-code \
  -H "content-type: application/json" -d '{"action":"health"}'
```

Esperado **401** — e já é o resultado de hoje; registre como confirmação de que o achado era falso positivo.
Se o caminho for remoção, repita depois do delete em produção → esperado **404**, e
`node scripts/edge-deploy/generate-manifest.mjs --check` → saída 0. Se for manutenção, prove o terceiro
nível: JWT de usuário do workspace A com `workspace_id` de B → **403**.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 029 — `kb-analyze-gaps`: escopo de workspace (o resíduo que a etapa 034 **não** cobre)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Multi-tenant
**Achados resolvidos:** SEC-02 (22 de 24), SEC-10 (ocorrência nesta function)

**Problema hoje:** a etapa **034** troca a checagem de presença de header
(`supabase/functions/kb-analyze-gaps/index.ts:27-32`) por `authenticateRequest`. Isso resolve "qualquer
`Bearer lixo` passa". **Não resolve o que sobra**, que é esta etapa:

1. `:50-54` — `supabase.from('oracle_history').select('query, confidence_score').order(...).limit(100)`,
   com o cliente `service_role` de `:43-46`. **Nenhum filtro de workspace.** São as últimas 100 consultas
   feitas por usuários — de **todos os clientes**. Depois da 034, qualquer usuário autenticado de qualquer
   workspace continua lendo as perguntas dos usuários de outro. É vazamento de conteúdo entre tenants, e um
   JWT válido não o impede.
2. `:41` — `knowledge_base_id` vem do payload (`InputSchema`) e é usado adiante sem que se verifique que a
   base pertence ao workspace do chamador.
3. `:43-46` — o `service_role` segue sendo usado para tudo, inclusive leitura de dado de usuário, o que
   anula a RLS que seria a rede de segurança natural para os itens 1 e 2.

**Causa raiz:** a function foi escrita como análise global ("proxy para queries dos usuários", comentário de
`:49`) num produto multi-workspace. Não é descuido de filtro: é um desenho single-tenant dentro de um sistema
multi-tenant.

**Caminho recomendado:**

1. **Faça a etapa 034 primeiro.** Sem o `workspaceId` que o `authenticateRequest` devolve
   (`_shared/auth.ts:119-122`) não há por onde filtrar; esta etapa é literalmente o uso daquilo que a 034
   produz. Fazer as duas juntas numa PR também é aceitável, mas então diga na PR que são dois defeitos.
2. Filtre `:50-54` por `workspace_id` — e **verifique antes se `oracle_history` tem essa coluna**. Se não
   tiver, pare: a correção vira uma migration (coluna + backfill + índice) e isso **exige o dono**; registre
   como bloqueio em vez de improvisar um filtro por outra coluna. Esta auditoria não teve acesso ao banco
   (`01-INVENTARIO.md` §6) e **não pôde confirmar o esquema da tabela** — confirme você.
3. Valide `knowledge_base_id` (`:41`) contra o workspace do chamador antes de usá-lo, com
   `validateWorkspaceMembership` (`_shared/auth.ts:171-184`) ou uma consulta direta à base.
4. Troque o cliente: o que é leitura de dado do usuário (itens 1 e 2) passa pelo cliente do usuário
   (`supabase`); reserve o `supabaseAdmin` só para a escrita que exigir privilégio. Os dois vêm do mesmo
   helper (`_shared/auth.ts:11-17`), então isso não acrescenta código.
5. **Atalho tentador a evitar:** filtrar `oracle_history` por `knowledge_base_id` em vez de por workspace.
   Parece equivalente e não é: o `knowledge_base_id` é escolhido pelo chamador, então filtrar por ele é
   filtrar pelo que o atacante pediu. O filtro tem de usar o workspace resolvido no servidor.

**Arquivos e objetos a tocar:** `supabase/functions/kb-analyze-gaps/index.ts` (`:41`, `:43-46`, `:50-54` e
os usos seguintes de `supabase`).

**Não tocar / armadilhas:** não refaça a autenticação — é a etapa 034, e duas PRs mexendo no mesmo bloco
`:27-46` conflitam. Não altere o `InputSchema` nem a lógica de detecção de lacuna (`:56-60` em diante).
**Armadilha de escopo:** esta é uma das 7 do COST-01 — **orçamento é a faixa 039-045**; aqui é só
isolamento de dado. Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007, 034 · **Libera:** —

**Risco e como reverter:** médio — se `oracle_history` não tiver `workspace_id`, a análise de lacunas passa a
devolver vazio em vez de errado, e isso aparece como "a funcionalidade parou". Confirme o esquema antes.
Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** — **salvo** se o passo 2 exigir migration em
`oracle_history`, e nesse caso **sim** (DDL em produção).

**Como verificar:** com JWT de usuário do workspace A, chame a function e confirme que **nenhuma** das
consultas analisadas pertence ao workspace B. Isso exige dois workspaces com dado e leitura do banco — se
você não tiver (a auditoria não teve), a verificação mínima aceitável é inspecionar a query montada no log da
function e confirmar que ela contém o filtro de workspace; registre **qual** das duas verificações você fez,
e não declare o isolamento provado se fez só a segunda.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 030 — `kb-translate-article`: escopo de workspace (o resíduo que a etapa 035 **não** cobre)

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Multi-tenant
**Achados resolvidos:** SEC-02 (23 de 24), SEC-10 (ocorrência nesta function)

**Problema hoje:** a etapa **035** troca a checagem de presença de header
(`supabase/functions/kb-translate-article/index.ts:35-40`) por `authenticateRequest`. O resíduo é este:
`:51-54` cria o cliente com `requireEnv('SUPABASE_SERVICE_ROLE_KEY')` e `:57-61` faz
`.from('kb_articles').select('*').eq('id', article_id).maybeSingle()` — **busca pelo id do payload (`:49`),
com privilégio total, sem nenhuma verificação de a quem o artigo pertence**. Depois da etapa 035, qualquer
usuário autenticado de qualquer workspace continua podendo **ler o conteúdo integral de um artigo de outro
cliente** (e pagar uma tradução de LLM sobre ele) bastando conhecer ou adivinhar um uuid.

**Causa raiz:** idêntica à 029 e à forma geral do SEC-10 — o identificador do recurso veio do chamador e o
`service_role` dispensou a RLS, então nada no caminho comparou o dono do recurso com quem pediu.

**Caminho recomendado:**

1. **Faça a etapa 035 primeiro** (que por sua vez depende da 034). Esta etapa consome o `workspaceId` que
   aquela passa a produzir.
2. Depois de carregar o artigo em `:57-61`, **compare `article.workspace_id` com o workspace do chamador** e
   devolva 403 se diferirem. Faça nessa ordem — carregar e então comparar — e não tente filtrar na própria
   consulta por um `workspace_id` vindo do payload: o chamador escolheria os dois valores.
   Se `kb_articles` não tiver `workspace_id`, **pare e registre o bloqueio**; o esquema não pôde ser
   confirmado nesta auditoria (`01-INVENTARIO.md` §6, sem acesso ao banco).
3. Mova a chamada de tradução para **depois** da verificação. Hoje a leitura do artigo (`:57`) e a chamada
   de LLM acontecem antes de qualquer noção de dono; mesmo com a 035 aplicada, se a comparação ficar no fim,
   você já pagou a tradução do artigo alheio antes de recusar.
4. Troque o cliente de `service_role` para o do usuário na leitura de `kb_articles` — assim, se a RLS da
   tabela estiver correta, ela vira uma segunda barreira em vez de ser contornada. Mantenha `supabaseAdmin`
   só para a escrita da tradução, se ela precisar.
5. **Atalho tentador a evitar:** confiar que "o uuid é imprevisível". Não é controle de acesso; é obscuridade.
   E o id circula em URL, log e export — o achado SEC-11 do mesmo relatório já mostra que geração de valor
   imprevisível não é um ponto forte deste repositório.

**Arquivos e objetos a tocar:** `supabase/functions/kb-translate-article/index.ts` (`:49`, `:51-54`,
`:57-62` e a ordem da chamada de tradução).

**Não tocar / armadilhas:** não refaça a autenticação (é a 035) nem toque nos prompts de tradução. Não
altere o `InputSchema` (`target_language`). **Armadilha de escopo:** uma das 7 do COST-01 — **orçamento é a
faixa 039-045**. Esta function **não** tem `verify_jwt = false` no `supabase/config.toml:3-31`.

**Depende de:** 007, 035 · **Libera:** —

**Risco e como reverter:** baixo-médio; o risco é a tradução passar a recusar artigos legítimos se o campo de
workspace do artigo estiver nulo em linhas antigas — confira antes. Reverter: `git revert` +
`workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** — **salvo** se faltar `workspace_id` em
`kb_articles` e for preciso migration, e nesse caso **sim**.

**Como verificar:** com JWT de um usuário do workspace A e o `article_id` de um artigo do workspace B →
esperado **403**, e **nenhuma** chamada registrada na OpenRouter para essa requisição. Com um artigo do
próprio workspace → 200. O teste cruzado exige dois workspaces com dado e credencial de usuário, que a
auditoria não teve; se você também não tiver, registre o caminho feliz e declare o teste de isolamento
pendente em vez de afirmar que o vazamento foi fechado.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 031 — `visual-search`: mover o gate para antes da chamada de visão (o resíduo que a etapa 036 **não** cobre)

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** SEC-02 (24 de 24)

**Problema hoje:** a etapa **036** decide, por teste, se o encaminhamento de
`supabase/functions/visual-search/index.ts:141-150` (que manda `Authorization: Bearer ${SERVICE_KEY}` e
`apikey: SERVICE_KEY` ao `semantic-search`) é bypass de autorização ou feature morta, e corrige **essa
parte** — autenticar o chamador e repassar o token do usuário. O resíduo é **onde** o gate fica, e é um
problema de custo, não de dado:

A chamada paga de visão acontece **antes** de qualquer contato com o `semantic-search`. O handler vai de
`:48` a `:131`: CORS (`:49-50`), rate limit (`:52-54`), zod (`:29-36`, `:57-60`) e, em seguida, a chamada
multimodal à OpenRouter que produz a `description` lida em `:130-131`. O schema aceita
`image: z.string().min(1).max(20_000_000)` (`:31`) — **20 MB de base64 por requisição**, enviados a um modelo
de visão com a chave do dono. Se a correção da 036 puser o `authenticateRequest` junto do trecho que ela
toca (`:141` em diante), **a chamada cara continua acontecendo para qualquer anônimo** e só o passo de busca
fica protegido. É a forma clássica de "corrigi a autenticação" que não corrige o que custa dinheiro.

**Causa raiz:** o pipeline está descrito em duas etapas (`:7-12`) e a autorização foi pensada só para a
segunda, porque é a segunda que toca dado de outro workspace. O gasto da primeira não entrou na conta.

**Caminho recomendado:**

1. **Faça a etapa 036 primeiro**, inclusive o teste que ela manda fazer antes de escrever código — o
   desfecho (a) ou (b) muda se esta function tem futuro.
2. O trabalho aqui é de uma linha de posicionamento, e é o que importa: o `authenticateRequest` tem de ficar
   **entre `:54` e `:57`** — depois do rate limit, antes do parse e muito antes de `:130`. Prove que ficou
   certo pela medição do passo 5, não pela leitura.
3. Reduza o teto de `:31`. 20 MB de base64 por requisição é um custo de visão por chamada que nenhuma tela
   precisa: `src/services/searchService.ts:56` é o único chamador e envia foto de interface. Combine o novo
   teto com o dono (sugestão: 5 MB), porque é limite de produto.
4. Depois de autenticar, troque o identificador de rate limit de `:52` para
   `getRateLimitIdentifier(req, user.id)` (`_shared/rate-limiter.ts:57-64`), padrão de
   `skill-describe-llm/index.ts:242-244`.
5. **Atalho tentador a evitar:** deixar o gate onde a 036 o colocou e "resolver o custo na faixa 039-045".
   O orçamento daquela faixa controla **quanto** um workspace gasta; não impede um anônimo de gastar, porque
   anônimo não tem workspace. As duas coisas são necessárias, e a ordem certa é esta primeiro.

**Arquivos e objetos a tocar:** `supabase/functions/visual-search/index.ts` (`:31` teto da imagem;
`:48-57` posição do gate; `:52` identificador do rate limit).

**Não tocar / armadilhas:** não altere o `VISION_PROMPT` (`:38-46`) nem o encaminhamento de `:141-156` — é
escopo da 036 e mexer nos dois lugares em PRs diferentes gera conflito. Não toque em
`supabase/functions/semantic-search/index.ts`. **Armadilha de escopo:** uma das 7 do COST-01 — **orçamento é
a faixa 039-045**; aqui é só autenticação e teto de entrada. Esta function **não** tem `verify_jwt = false`
no `supabase/config.toml:3-31`. Armadilha de diagnóstico: se a etapa 036 concluir o desfecho (b) — a
function nunca funcionou —, **esta etapa pode virar remoção** no molde da 018; confirme com
`grep -rn "visual-search" src/` (hoje: `src/services/searchService.ts:3,56,65`, portanto **há** chamador, e
remover exige mexer na tela de busca).

**Depende de:** 007, 036 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** — mas o novo teto de imagem (passo 3) é decisão de
produto; pergunte em uma linha no corpo da PR.

**Como verificar:** a verificação **tem de medir o custo, não só o status**:

```
curl -s -o /dev/null -w "%{http_code}\n" -X POST .../functions/v1/visual-search \
  -H "content-type: application/json" \
  -d '{"image":"data:image/png;base64,iVBORw0KGgo="}'
```

Esperado **401**, e — a parte que prova esta etapa — **nenhuma chamada nova de visão** no painel da
OpenRouter e nenhuma linha de chamada ao modelo no log da function para essa requisição. Se o 401 vier mas o
log mostrar a chamada ao modelo, o gate está no lugar errado. Depois, com JWT válido, confirme 200 e
resultados do próprio workspace.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 032 — Fazer o guard de CI validar o deploy real, não apenas a intenção declarada

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura (CI)
**Achados resolvidos:** SEC-02

**Problema hoje:** `.github/workflows/guards.yml:125` roda
`node scripts/edge-deploy/generate-manifest.mjs --check`, num passo chamado
_"supabase/deployment-manifest.json bate com supabase/functions/"_. Esse guard compara o manifest com o
`config.toml` e o diretório — e **nunca** com o comando de deploy. É por isso que o manifest pôde registrar
`verify_jwt_true: 80` (EXECUTADO: 80 entradas `"verify_jwt": true`) enquanto
`scripts/deploy-edge-functions.sh:23` deployava as 89 com `--no-verify-jwt`, com o CI verde o tempo todo.

**Causa raiz:** o guard verifica a consistência entre dois documentos declarativos e ignora o script que
produz o efeito. Era possível ficar verde descrevendo algo que o deploy contradiz.

**Caminho recomendado:**

1. Acrescente ao `scripts/edge-deploy/generate-manifest.mjs --check` uma verificação do próprio
   `scripts/deploy-edge-functions.sh`: para cada function, o modo com que o script a deployaria tem de ser
   igual ao `verify_jwt` do manifest. Como a etapa 007 passou o script a ler o `config.toml`, a verificação
   é determinística.
2. **Atalho a evitar:** não "corrija" o manifest para dizer `verify_jwt_false: 89`. Isso deixaria os três
   documentos coerentes e produção insegura — exatamente o problema invertido. O manifest deve descrever o
   estado _desejado_ (9 sem JWT) e o guard deve falhar se o deploy divergir dele.
3. Enquanto a etapa 007 não estiver mergeada, este guard **vai falhar** — e é o comportamento correto. Faça
   as duas na ordem.

**Arquivos e objetos a tocar:** `scripts/edge-deploy/generate-manifest.mjs`; se necessário,
`.github/workflows/guards.yml`.

**Não tocar / armadilhas:** não altere `supabase/deployment-manifest.json` à mão (tem `manifest_sha256`).
Não transforme o `guards.yml` em check obrigatório nesta etapa — isso é a 052, que o dono precisa aprovar.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo; é código de CI. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **sim** — mexe em `.github/workflows/` e em script de deploy.

**Como verificar:** `node scripts/edge-deploy/generate-manifest.mjs --check` → sai 0 com a 007 aplicada.
Teste negativo (o que prova que o guard funciona): reintroduza `--no-verify-jwt` global numa cópia local do
script e rode o `--check` → tem de sair **diferente de 0**. Registre as duas saídas.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 033 — `llm-gateway`: negar por padrão quando não há workspace, em vez de liberar

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Regra de negócio
**Achados resolvidos:** COST-02

**Problema hoje:** `supabase/functions/llm-gateway/index.ts:264` é
`if (!workspaceId) return { allowed: true };`, e `workspaceId` é **opcional** no payload (`:325-332` →
`p: { workspaceId?: string; … }`). Uma chamada sem `workspace_id` devolve "permitido" **antes** de qualquer
verificação: não chama `rpc('check_budget')` (`:267`), não varre a tabela `budgets` (`:285-299`) e não aplica
o kill switch por agente (`:307`). O orçamento inteiro do sistema é, hoje, opcional para quem chama.

**Causa raiz:** o caminho sem workspace foi tratado como "não há orçamento a aplicar" em vez de "não sei de
quem é esta chamada". O default escolhido foi permitir.

**Caminho recomendado:**

1. Resolva o workspace **no servidor**, a partir do usuário autenticado, em vez de confiar no payload. O
   padrão correto já existe no repositório: `supabase/functions/whatsapp-outbound/index.ts:9-11` documenta e
   implementa "workspace_id resolvido server-side via `workspace_members`".
2. Se, depois de resolver, ainda não houver workspace, **negue**: `{ allowed: false, reason: 'workspace_required' }`.
3. **Atalho a evitar:** tornar `workspaceId` obrigatório apenas no schema de entrada. Quem chama de dentro do
   próprio backend (ex.: `queue-worker` repassando trabalho) continuaria passando o que quisesse; e um campo
   obrigatório vindo do cliente não é fonte confiável de autorização. A resolução tem de ser server-side.
4. Faça esta etapa junto da revisão dos chamadores: `grep -rn "llm-gateway" src/ supabase/functions/` para
   listar quem invoca e confirmar que todos têm workspace resolvível.

**Arquivos e objetos a tocar:** `supabase/functions/llm-gateway/index.ts` (função `checkBudget` e o ponto que
a chama).

**Não tocar / armadilhas:** não mexa na tabela de preços nem no cálculo de custo nesta etapa (é a etapa da
Onda 3 sobre COST-03). **Armadilha real:** negar por padrão pode quebrar chamadas internas legítimas que hoje
passam sem workspace — levante os chamadores **antes** de mergear, porque a falha vai aparecer como "o agente
parou de responder", não como erro de orçamento.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio — pode bloquear fluxo legítimo. Reverter: `git revert` + `workflow_dispatch`
do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** (mudança de código em edge function; sem DDL, sem
segredo, sem CI). Mas **avise o dono** no corpo da PR: é mudança de comportamento com efeito em custo.

**Como verificar:** chamada ao `llm-gateway` **sem** `workspace_id`, com JWT válido, em ambiente
descartável → esperado `allowed: false` / HTTP de recusa com `reason` de workspace ausente. Hoje a mesma
chamada é atendida. Registre as duas respostas.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 034 — `kb-analyze-gaps`: validar o token, não só a presença do header

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-03

**Problema hoje:** `supabase/functions/kb-analyze-gaps/index.ts:27-32` faz
`const auth = req.headers.get('Authorization'); if (!auth) return 401` — e **nada mais**. O token nunca é
validado. Em seguida, `:43-45` cria o cliente com `requireEnv('SUPABASE_SERVICE_ROLE_KEY')`. Portanto
`Authorization: Bearer qualquer-coisa` passa e executa trabalho com privilégio total, incluindo chamada paga
de LLM. **É pior que não ter autenticação:** a function devolve 401 para quem não manda header, então parece
protegida em qualquer inspeção rápida.

**Causa raiz:** checagem de presença confundida com checagem de validade.

**Caminho recomendado:**

1. Troque o bloco por `authenticateRequest` do barril `_shared/mod.ts` — o helper endurecido que **24
   functions já usam**. Referência de uso correto: `supabase/functions/whatsapp-outbound/index.ts:20,26`.
2. Depois de autenticar, use o cliente **com o token do usuário** para o que for leitura de dado do usuário, e
   reserve o `service_role` só para o que exige privilégio. O helper devolve os dois
   (`_shared/auth.ts:12-17`: `supabase` e `supabaseAdmin`).
3. **Atalho a evitar:** comparar o header com um segredo compartilhado. Isso resolveria o acesso anônimo, mas
   perde a identidade do chamador — e esta function precisa saber **de quem** é a base de conhecimento que
   está analisando, senão o próximo defeito é um usuário analisar a base de outro workspace.

**Arquivos e objetos a tocar:** `supabase/functions/kb-analyze-gaps/index.ts`.

**Não tocar / armadilhas:** não altere o `InputSchema` nem a lógica de análise. Atenção: esta function é uma
das 7 que gastam LLM sem passar pelo `llm-gateway` (achado COST-01) — a correção de custo é outra etapa; aqui
só a autenticação.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo. Se algum chamador interno dependia do acesso frouxo, ele passa a receber
401 — e isso é o comportamento desejado. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}" -X POST .../functions/v1/kb-analyze-gaps \
  -H "Authorization: Bearer lixo" -H "content-type: application/json" \
  -d '{"knowledge_base_id":"00000000-0000-0000-0000-000000000000"}'
```

Esperado **401**. Hoje passa da autenticação. Repita com um JWT válido → esperado 200/400 conforme o payload.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 035 — `kb-translate-article`: mesma correção da 034

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** SEC-03

**Problema hoje:** `supabase/functions/kb-translate-article/index.ts:35-40` repete o padrão da etapa 034:
só verifica se o header `Authorization` existe, não valida o token, e usa `service_role` em seguida.

**Causa raiz:** a mesma da 034 — o padrão foi copiado entre as duas functions.

**Caminho recomendado:** idêntico à etapa 034. Faça **depois** dela, para reaproveitar exatamente a mesma
forma de chamada do `authenticateRequest` e manter as duas consistentes. Mantenha as duas em PRs separadas:
são two functions diferentes e o escopo de cada etapa é uma mudança atômica.

**Arquivos e objetos a tocar:** `supabase/functions/kb-translate-article/index.ts`.

**Não tocar / armadilhas:** não toque na lógica de tradução nem nos prompts.

**Depende de:** 034 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** mesmo `curl` da 034 apontado para `kb-translate-article` → esperado **401** com
`Authorization: Bearer lixo`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 036 — Decidir, por teste, se `visual-search` é bypass de autorização ou feature morta

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge)
**Achados resolvidos:** SEC-04

**Problema hoje:** `supabase/functions/visual-search/index.ts:141-150` encaminha para o `semantic-search`
usando `Authorization: Bearer ${SERVICE_KEY}` e `apikey: SERVICE_KEY`. E
`supabase/functions/semantic-search/index.ts:83-90` faz `auth.getUser()` e devolve 401 se não houver usuário.
`visual-search` não autentica ninguém.

**Causa raiz:** a function encaminha com a credencial do sistema em vez de repassar o token do usuário —
o padrão "confused deputy". O gate do `semantic-search` deixa de valer para quem entra por esta porta.

**Caminho recomendado:**

1. **Comece pelo teste, antes de escrever qualquer correção**, porque os dois desfechos pedem correções
   diferentes:
   - (a) se a `service_role` **passa** pelo `getUser()`: é bypass de autorização — um chamador anônimo obtém
     busca semântica sobre conteúdo de qualquer workspace. Severidade Crítica.
   - (b) se **não passa** (o esperado: o JWT de `service_role` não tem `sub` de usuário): `visual-search`
     está quebrada — sempre recebe 401 e nunca devolve resultado. Severidade Alta, e o achado muda de
     "segurança" para "funcionalidade entregue como pronta e que nunca funcionou".
     Teste: chamar `semantic-search` com a `service_role` como Bearer, **em ambiente descartável, nunca em
     produção**, e registrar o status.
2. Em qualquer dos dois casos a correção estrutural é a mesma: `visual-search` passa a (i) autenticar o
   chamador com `authenticateRequest` e (ii) **repassar o token do usuário** ao `semantic-search`, não a
   `service_role`.
3. **Atalho a evitar:** remover o gate do `semantic-search` para "fazer o `visual-search` funcionar". Isso
   abriria a busca semântica para qualquer um e transformaria (b) em (a).

**Arquivos e objetos a tocar:** `supabase/functions/visual-search/index.ts`. Não altere
`semantic-search/index.ts`.

**Não tocar / armadilhas:** o passo 1 da function (descrição da imagem por LLM, até `:138`) não faz parte
desta etapa. **Armadilha:** se o teste der (b), existe a chance de que ninguém use `visual-search` hoje —
confirme com `grep -rn "visual-search" src/` antes de investir na correção; se não houver chamador, a etapa
pode virar "remover a function" (registre no progresso e abra a etapa de higiene correspondente).

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** chamada a `visual-search` com JWT de usuário do workspace A pedindo conteúdo do
workspace B → esperado: nenhum resultado de B. E chamada **sem** JWT → esperado 401.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 037 — `a2a-server`: recusar com 401 quando o chamador não manda credencial, em vez de inventar uma

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge)
**Achados resolvidos:** SEC-05

**Problema hoje:** `supabase/functions/a2a-server/index.ts:235`:

```ts
const authHeader =
  req.headers.get('Authorization') || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`;
```

Quando o request **não** traz `Authorization`, a function fabrica um Bearer com a chave `anon` e **segue
processando**. Esse `authHeader` é repassado a `processTask` (`:237-247`) e usado no `fetch` para
`smolagent-runtime` (`:144`: `'Authorization': authHeader, 'apikey': anonKey`). A própria function roda com
`SUPABASE_SERVICE_ROLE_KEY` (`:202`) e usa essa chave para ler agentes (`getAgentCard`, `:224-227`). O Agent
Card que ela publica em `/.well-known/agent.json` declara `authentication: { schemes: ['bearer'] }`
(`:125`) — ou seja, anuncia que exige bearer e aceita ausência de bearer.

**Causa raiz:** ausência de credencial tratada como credencial anônima válida. O `||` foi escrito para dar
um valor-padrão ao header (evitar `null` no `fetch`), e o efeito colateral foi transformar "não sei quem é"
em "é o usuário anônimo, pode seguir".

**Caminho recomendado:**

1. Separe as duas rotas, porque elas têm requisitos diferentes:
   - `GET /.well-known/agent.json` (descoberta, `:213-218`) é por desenho público no protocolo A2A — **não
     exija credencial aqui**, só confirme que o card não expõe nada além de nome, descrição e skills.
   - `POST /tasks/send` (`:220-253`) executa trabalho e gasta recurso — **exija autenticação**.
2. No `POST`, troque a linha 235 por uma recusa explícita: se não houver `Authorization`, devolva
   `errorResponse(req, 'Missing authorization', 401)` — a mesma forma já usada em
   `supabase/functions/oracle-council/index.ts:48-53`, que é o padrão curto deste repositório para "sem
   header, 401".
3. Depois de ter o header, **valide o token** (não basta existir): o padrão endurecido é
   `authenticateRequest` do barril `supabase/functions/_shared/mod.ts`, usado por 24 functions; a referência
   de uso correto é `supabase/functions/whatsapp-outbound/index.ts:9-11,20`. Repasse o **token do chamador**
   ao `smolagent-runtime`, nunca a `service_role`.
4. **Atalho tentador a evitar:** trocar `SUPABASE_ANON_KEY` por `SUPABASE_SERVICE_ROLE_KEY` na linha 235 para
   "fazer funcionar sempre". Isso transformaria um acesso anônimo em um acesso com privilégio total — o
   mesmo defeito do SEC-04 (`visual-search`). Também não "resolva" validando só o formato do token: o A2A é
   um protocolo entre agentes de **organizações diferentes**; quem chama precisa de identidade real.
5. Se existir integração externa legítima que hoje chama sem header, ela vai quebrar. Antes de mergear,
   rode `grep -rn "a2a-server" src/ supabase/functions/ docs/` para levantar chamadores internos e avise o
   dono se houver parceiro externo configurado.

**Arquivos e objetos a tocar:** `supabase/functions/a2a-server/index.ts` (handler do `POST /tasks/send` e a
passagem de `authHeader`/`anonKey` para `processTask`).

**Não tocar / armadilhas:** não altere `A2ATaskSchema` (`:22-32`) nem a lógica de montagem do Agent Card.
**Armadilha:** a rota `path === '/'` atende **os dois** métodos (GET de card e POST de task, `:214` e `:221`)
— se você puser a checagem de auth no topo do handler, quebra a descoberta pública. A checagem tem de ficar
dentro do ramo do `POST`. Segunda armadilha: `anonKey` (`:236`) cai para `supabaseKey` (a `service_role`)
quando `SUPABASE_ANON_KEY` não está definida — corrija isso junto, porque é o mesmo defeito escrito duas
vezes na mesma função.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo-médio; quem chamava sem credencial passa a receber 401, que é o
comportamento desejado. Reverter: `git revert` da PR e `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** (código de edge function; sem DDL, sem segredo, sem
workflow). Lembre no corpo da PR: **merge na `main` publica a edge function automaticamente**
(`.github/workflows/edge-deploy.yml`), então este merge é um deploy.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}" -X POST https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/a2a-server/tasks/send \
  -H 'content-type: application/json' \
  -d '{"message":{"parts":[{"type":"text","text":"ping"}]}}'
```

Esperado **401** (hoje a requisição é aceita e segue para o processamento). Depois:
`curl -s https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/a2a-server/.well-known/agent.json` → ainda
**200** com o card. Registre os dois códigos.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 038 — `cron-executor`: validar o destino antes de disparar a requisição com a chave do sistema

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Segurança
**Achados resolvidos:** SEC-06

**Problema hoje:** `supabase/functions/cron-executor/index.ts` monta o destino da requisição a partir de uma
coluna de texto livre da tabela `cron_schedules`, sem nenhuma validação:

- ramo `edge_function` (`:62-70`): `const fnUrl = \`${baseUrl}/functions/v1/${schedule.target_id}\``e, no
header,`Authorization: Bearer ${serviceRoleKey}` (`:68`);
- ramo `webhook` (`:80-81`): `const webhookUrl = schedule.target_id` — a coluna **é** a URL inteira.

`target_id` é `TEXT NOT NULL` sem CHECK nenhum
(`supabase/migrations/20260405220001_automation_services.sql:23`). A function não autentica ninguém
(`grep "Authorization" cron-executor/index.ts` → **uma única ocorrência**, a da linha 68, que é de saída) e
roda com `service_role` (`:29,35`).

**Precisão sobre o impacto** (li os dois ramos; a leitura "entrega a chave para um servidor escolhido pelo
atacante" junta coisas que estão em ramos diferentes):

- no ramo `webhook`, o destino é arbitrário mas **não leva credencial** — é SSRF sem vazamento de chave;
- no ramo `edge_function`, o host é fixo, mas `target_id` entra no **caminho** da URL já com a `service_role`
  no header. Como o parser de URL normaliza `..`, um `target_id` do tipo `../../rest/v1/<tabela>?select=*`
  apontaria a requisição autenticada para a API REST do próprio projeto, ignorando toda a RLS. **Esse
  desfecho específico é HIPÓTESE — confirme no passo 1 do caminho abaixo antes de dimensionar a severidade.**

**Causa raiz:** destino de requisição vindo de dado gravável, somado a credencial privilegiada no header, sem
nenhuma função intermediária que valide o destino.

**Caminho recomendado:**

1. **Comece reproduzindo, em ambiente descartável** (`npx supabase functions serve cron-executor` contra um
   Postgres descartável, nunca produção): insira uma linha em `cron_schedules` com
   `target_type='edge_function'` e `target_id='../../rest/v1/workspaces?select=*'` e observe para onde a
   requisição sai. Isso decide se a correção precisa cobrir travessia de caminho ou só nome de function.
2. Valide `target_id` **no código da function**, não só no banco:
   - `edge_function`: aceite apenas `^[a-z0-9][a-z0-9-]{0,62}$` **e** que o nome esteja no conjunto de
     functions conhecidas. A fonte da verdade já existe e é versionada: `supabase/deployment-manifest.json`
     (o mesmo arquivo que a etapa 032 passa a cobrar). Nome fora do conjunto → `execStatus = 'failed'` com
     `execError = 'target_id inválido'`, sem disparar requisição.
   - `webhook`: exija `new URL(...)` com `protocol === 'https:'`, rejeite host que resolva para faixa privada
     ou de loopback (`localhost`, `127.`, `10.`, `172.16–31.`, `192.168.`, `169.254.`, `::1`) e rejeite o
     próprio host do Supabase. Sem `Authorization` neste ramo — e isso já está certo hoje, **não acrescente**.
3. **Atalho tentador a evitar:** resolver isso com um `CHECK` na coluna `target_id` e parar por aí. O CHECK é
   bom, mas (a) é uma migration em produção, que custa aprovação e tempo, e (b) não protege as linhas que já
   existem na tabela — e esta auditoria **não conseguiu ler o banco**, então ninguém sabe o que já está
   gravado lá. A validação no código protege também o que já existe. Faça o CHECK depois, como reforço.
4. **Segundo atalho a evitar:** trocar `fetchWithTimeout` por `deliverWebhook` de
   `supabase/functions/_shared/webhookSender.ts` achando que ele resolve. O comentário dele (`:50`) diz
   "Usado por: workflow-engine-v2, cron-executor, notification-sender" e isso é **falso** — medido:
   nenhuma function o importa, só `_shared/mod.ts` o reexporta. E ele **não tem nenhuma validação de URL**
   (`grep "new URL\|hostname\|protocol"` → zero ocorrências). Ele dá assinatura HMAC e retry, não SSRF.
5. Depois da 007, esta function continua pública se não ganhar autenticação própria — ela está na lista das
   24 (etapas 008–031). Esta etapa trata o destino; a autenticação é a etapa da lista.

**Arquivos e objetos a tocar:** `supabase/functions/cron-executor/index.ts` (os ramos `edge_function` e
`webhook` do `switch` em `:59-102`, mais uma função de validação local no topo do arquivo).

**Não tocar / armadilhas:** não altere `BodySchema` (`:8`) nem a consulta de agendamentos (`:39-46`). Não
mexa nas migrations que criam `cron_schedules`. **Armadilha:** o `baseUrl` (`:62`) tem um fallback com o
project ref `qdlnzopxrlsoljcrcmzv` **em literal** — não "limpe" isso nesta etapa; é o ID correto do projeto
oficial (`supabase/config.toml:1`) e trocá-lo é outro escopo.

**Depende de:** 006, 007 · **Libera:** —

**Risco e como reverter:** médio — um `target_id` legítimo fora do padrão passa a falhar. Mitigação: na
primeira versão, **registre** o rejeitado em `execError` em vez de só falhar em silêncio, e leia a tabela de
execuções depois do primeiro ciclo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** para a mudança de código. **Sim** se você decidir
acrescentar o `CHECK` na coluna (aí é DDL em produção) — nesse caso, abra etapa separada.

**Como verificar:** em ambiente descartável, três linhas em `cron_schedules` com `next_run_at` no passado e
`status='active'`:

1. `target_type='edge_function'`, `target_id='health-check'` → execução normal, `status=success`;
2. `target_type='edge_function'`, `target_id='../../rest/v1/workspaces?select=*'` → **nenhuma requisição
   enviada**, `execError` com "target_id inválido";
3. `target_type='webhook'`, `target_id='http://169.254.169.254/latest/meta-data/'` → rejeitado.
   Registre as três linhas resultantes de `cron_executions` (ou a saída do log da function).

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 039 — `agent-conversational-builder`: autenticar e aplicar orçamento antes de gastar LLM

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (1 de 7)

**Problema hoje:** a function importa `AI_API_KEY_ENV`/`AI_CHAT_COMPLETIONS_URL` de
`supabase/functions/_shared/ai-provider.ts` (`agent-conversational-builder/index.ts:10`) e chama a OpenRouter
direto (`:79-86`), com a chave do dono no header (`:82`). **Não há nenhuma autenticação no arquivo**: o
handler vai de `handleCorsPreflight` (`:51`) direto para o rate limit (`:54-56`) e para a chamada paga
(`:59-79`) — confirmei lendo `:50-100`. O único freio é `checkRateLimit(identifier, RATE_LIMITS.heavy)`
(`:55`), e `supabase/functions/_shared/rate-limiter.ts:40` guarda o contador em
`const store = new Map<string, number[]>()`, isto é, **memória do isolate**: reinicia e não é compartilhado
entre isolates. O `ai-provider.ts` não tem nenhuma verificação de orçamento e não grava consumo — `aiCostUsd`
(`:44-52`) é função pura e devolve `null` para qualquer modelo fora das 3 linhas de `PRICES_PER_1M`
(`:37-41`), e o modelo usado aqui (`google/gemini-2.5-flash`, `:86`) **não está** nessas 3 linhas.

**Causa raiz:** o controle de orçamento foi implementado dentro de **um** caminho (o `llm-gateway`), e um
helper compartilhado (`ai-provider.ts`) abriu um segundo caminho que não passa por ele.

**Caminho recomendado:**

1. Autentique primeiro. Padrão curto e já usado no repositório:
   `supabase/functions/oracle-council/index.ts:48-66` — lê `Authorization`, 401 se ausente, cria o client com
   a **anon key + header do usuário**, chama `auth.getUser()`, 401 se não houver usuário.
2. **Aqui a correção NÃO é rotear pelo `llm-gateway`, e a razão é verificável:** esta function usa
   `tools` (`:89`) e `stream: true` (`:88`) — ela depende de _tool calling_ (`patch_agent`) para preencher os
   campos do agente. O `llm-gateway` aceita `tools` no contrato v2
   (`supabase/functions/_shared/contracts.ts:98-108`) mas **nunca os repassa ao provedor**: `grep -n "tools"
supabase/functions/llm-gateway/index.ts` → **zero ocorrências**. Rotear por ele hoje faria o modelo parar
   de chamar a ferramenta, e o builder deixaria de preencher o agente — uma quebra silenciosa.
3. Então aplique o orçamento **nesta function**: depois de autenticar, resolva o workspace no servidor
   (`from('workspace_members').select('workspace_id').eq('user_id', user.id)` — mesmo padrão de
   `llm-gateway/index.ts:751-756`) e chame `supabase.rpc('check_budget', { p_workspace_id })`, exatamente como
   `llm-gateway/index.ts:267`. Se `bs.configured && !bs.allowed`, devolva **402** com o motivo, **antes** do
   `fetch` da linha 79.
4. **Saiba o limite do que você acabou de fazer, e registre no corpo da PR:** `public.check_budget` soma
   gasto a partir de `agent_traces.cost_usd` com `JOIN agents` (migration
   `20260418102513_4d1ac25f-…sql:105-110`). Como esta function **não grava** `agent_traces`, o orçamento dela
   lerá sempre 0 e nunca vai estourar sozinho. O `check_budget` aqui serve para **respeitar o limite já
   estourado por outros caminhos**; o registro do consumo deste caminho é o achado COST-03 (etapas 101–104).
   Não finja que esta etapa fecha a contabilidade — ela fecha o acesso anônimo e o respeito ao limite.
5. **Atalho tentador a evitar:** apertar o `RATE_LIMITS.heavy` achando que isso contém o gasto. Está medido
   que o contador é por isolate e reinicia; apertar o número não cria teto nenhum.

**Arquivos e objetos a tocar:** `supabase/functions/agent-conversational-builder/index.ts`;
`src/components/agent-builder/ConversationalBuilder.tsx` (ver armadilhas).

**Não tocar / armadilhas:** não toque no `SYSTEM_PROMPT` (`:30-48`) nem no parser de SSE. **Armadilha real no
front:** `ConversationalBuilder.tsx:75` envia
`Authorization: Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` — ou seja,
quando não há sessão ele manda a chave **anon** como se fosse o token do usuário. Depois desta etapa isso
vira 401, e o componente precisa tratar o erro em vez de quebrar o stream. Lembre que **merge na `main` não
publica o front-end** (achado DEPLOY-01): a correção da edge entra em produção sozinha, e a do componente
não — por isso o tratamento de erro tem de ser compatível com o front antigo, que continuará no ar.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** médio no front (a tela do builder conversacional deixa de funcionar para quem não
está logado — que é o comportamento certo). Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}" -X POST https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/agent-conversational-builder \
  -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"oi"}]}'
```

Esperado **401**, e nenhum token consumido na OpenRouter. Repita com `-H "Authorization: Bearer <JWT válido>"`
→ esperado **200** com stream. Este teste é de graça no caso 401 (a recusa acontece antes do `fetch` pago);
não repita o caso 200 em laço.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 040 — `kb-analyze-gaps`: rotear a chamada de LLM pelo `llm-gateway`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (2 de 7)

**Problema hoje:** `supabase/functions/kb-analyze-gaps/index.ts:13` importa `ai-provider` e `:88-92` chama a
OpenRouter direto, com a chave do dono (`:90`), **dentro de um laço** sobre até 10 lacunas abertas
(`:77-82` → `.limit(10)`; `:86` → `for (const gap of openGaps)`). Uma única requisição aceita pode disparar
**10 chamadas pagas**. O acesso é o do achado SEC-03: `:27-32` só confere que o header `Authorization`
existe, nunca valida o token — a etapa 034 corrige isso. Orçamento: nenhum, pelo mesmo motivo da etapa 039
(o `ai-provider.ts` não verifica nem grava nada).

**Causa raiz:** a mesma da etapa 039 — segundo caminho de chamada de LLM, fora do único ponto que aplica
orçamento.

**Caminho recomendado:**

1. Faça **depois da etapa 034**, que já troca o bloco de autenticação pelo `authenticateRequest`. Esta etapa
   pressupõe que você tem o token do usuário em mãos.
2. **Aqui a correção É rotear pelo `llm-gateway`**, e isto é decidível pelo payload: a chamada é um chat
   simples, só `model` + `messages` com `content` string (`:91-99`), sem `tools`, sem `stream`, sem conteúdo
   multimodal — exatamente o que o contrato v1 aceita
   (`supabase/functions/_shared/contracts.ts:60-78`). Compare com a etapa 039, onde não dá.
3. Padrão de referência, function-para-function, já em uso: `supabase/functions/oracle-council/index.ts:172-189`
   — `fetchWithTimeout(\`${supabaseUrl}/functions/v1/llm-gateway\`, { headers: { Authorization: authHeader,
   apikey: supabaseKey }, body: JSON.stringify({ model, messages, temperature, max_tokens }) })`. Repasse o
**header do usuário**, nunca a `service_role`: o gateway resolve o workspace sozinho a partir de
`workspace_members` (`llm-gateway/index.ts:751-756`) e é isso que faz o orçamento valer.
4. Acrescente `x-caller-function: kb-analyze-gaps` no header. O gateway já lê esse header (`:696`) e grava o
   chamador no trace — é assim que o dono vai conseguir ver, depois, quanto cada function gastou.
5. Trate o custo do laço: antes de entrar no `for`, **uma** verificação; e pare o laço no primeiro 402 do
   gateway em vez de insistir 10 vezes.
6. **Atalho tentador a evitar:** manter o `fetch` direto e só acrescentar um `check_budget` local. Funciona
   menos bem aqui do que na 039, porque o gateway **também grava o consumo** (`recordTrace`,
   `llm-gateway/index.ts:331+`) — e sem gravar consumo o orçamento nunca estoura (ver etapa 039, passo 4).
   Como esta chamada cabe no contrato, rotear é estritamente melhor.

**Arquivos e objetos a tocar:** `supabase/functions/kb-analyze-gaps/index.ts` (o bloco `:86-110` e o import
da linha 13, que deixa de ser necessário se nenhuma outra chamada paga sobrar no arquivo).

**Não tocar / armadilhas:** não altere a consulta de lacunas (`:77-82`) nem o `InputSchema`. **Armadilha:**
o gateway exige **JWT de usuário** — ele rejeita `service_role` (`llm-gateway/index.ts:705-717`,
`auth.getUser()` + 401). Se depois da etapa 034 alguma parte desta function ainda usar o client
`service_role`, não use essa credencial na chamada ao gateway. Segunda armadilha: o gateway roda detecção de
injeção de prompt (`:772+`) — o texto das lacunas vem de busca de usuário e pode disparar bloqueio; trate o
retorno bloqueado como "sem sugestão para esta lacuna", não como erro fatal do lote.

**Depende de:** 007, 033, 034 · **Libera:** —

**Risco e como reverter:** baixo-médio: a sugestão de tópico pode passar a ser recusada por orçamento ou por
guardrail. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** com JWT válido de um workspace que tenha `workspace_budgets` com `hard_stop = true` e
limite já atingido, chame `kb-analyze-gaps` → esperado **402/recusa por orçamento, sem nenhuma chamada à
OpenRouter**. Com limite folgado → 200. E confirme o rastro: uma linha nova em `agent_traces` com
`metadata->>'caller' = 'kb-analyze-gaps'`. Esta verificação **exige acesso ao banco** (`DB_MCP_URL`) e um
usuário de teste — se você não tiver os dois, registre como NÃO VERIFICADO e faça o teste mínimo: chamada sem
JWT → 401.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 041 — `kb-translate-article`: rotear a chamada de LLM pelo `llm-gateway`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (3 de 7)

**Problema hoje:** `supabase/functions/kb-translate-article/index.ts:13` importa `ai-provider`; `:55` lê a
chave com `requireEnv(AI_API_KEY_ENV)` e `:85-89` chama a OpenRouter direto com ela. A autenticação é a do
SEC-03 (`:35-40`, só presença do header) — corrigida pela etapa 035. Nenhuma verificação de orçamento e
nenhum registro de consumo, pelo mesmo motivo das etapas 039 e 040.

**Causa raiz:** a mesma da 040; o padrão foi copiado entre as duas functions de base de conhecimento.

**Caminho recomendado:** idêntico ao da etapa 040 — a chamada também é chat simples
(`model` + `messages` com `content` string, `:88-95`), sem `tools`, sem `stream`, sem imagem, portanto cabe
no contrato v1 do gateway (`_shared/contracts.ts:60-78`). Faça **depois da 040**, para copiar exatamente a
mesma forma de chamada e manter as duas iguais; use `x-caller-function: kb-translate-article`. Mantenha PRs
separadas: são functions diferentes e cada etapa é uma mudança atômica.
**Diferença de atenção em relação à 040:** aqui não há laço — é uma chamada por requisição — então não há
nada a interromper; em compensação, o texto traduzido é o conteúdo integral do artigo, o que torna o custo
por chamada **maior** que o da 040. Não reduza `max_tokens` para "economizar": isso trunca a tradução no meio
e o defeito reaparece como artigo cortado.
**Atalho tentador a evitar:** o mesmo da 040 — não resolva com `check_budget` local, porque isso deixa o
consumo sem registro e o orçamento sem como estourar.

**Arquivos e objetos a tocar:** `supabase/functions/kb-translate-article/index.ts` (bloco `:85-95` e o
import da linha 13).

**Não tocar / armadilhas:** não toque nos prompts de tradução nem no mapeamento de idiomas. **Armadilha:** o
chamador é `src/services/knowledgeManagementService.ts:196` via `supabase.functions.invoke`, que repassa o
JWT da sessão automaticamente — então o front **não** precisa mudar; não vá "consertar" o service.

**Depende de:** 040 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** mesma bateria da 040 apontada para `kb-translate-article`: sem JWT → **401**; com JWT e
orçamento estourado → **402 sem chamada à OpenRouter**; com orçamento folgado → 200 e uma linha em
`agent_traces` com `caller = 'kb-translate-article'`. Se não houver acesso ao banco, faça só o caso 401 e
registre o resto como NÃO VERIFICADO.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 042 — `quick-agent-test`: autenticar e rotear a chamada de LLM pelo `llm-gateway`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (4 de 7)

**Problema hoje:** `supabase/functions/quick-agent-test/index.ts:13` importa `ai-provider`; `:76` lê a chave
com `requireEnv(AI_API_KEY_ENV)` e `:91-98` chama a OpenRouter direto. **Não há autenticação alguma**: li
`:56-91` — o handler vai de CORS para `checkRateLimit(identifier, RATE_LIMITS.heavy)` (`:61-63`), valida o
payload (`:70-74`) e chama o modelo. Pior do que anônimo: o corpo é `{system_prompt, user_message, model}`
(`BodySchema`), ou seja, **quem chama escolhe o prompt inteiro e o modelo** — é um endpoint de LLM genérico
e gratuito, aberto na internet. E a tela ainda publica o jeito de usar: `RealExamplePreview.tsx:131-139`
monta um `curl` pronto com `Authorization: Bearer <ANON_KEY>` para o usuário copiar.

**Causa raiz:** a mesma causa das 039–041 (segundo caminho de LLM), agravada por um payload que delega ao
chamador a escolha do modelo — o parâmetro que determina o preço.

**Caminho recomendado:**

1. Autentique com o padrão de `oracle-council/index.ts:48-66` (401 sem header, 401 sem usuário).
2. Roteie pelo `llm-gateway`: o payload é chat simples (`messages` system+user, `:98-104`), sem `tools`,
   sem `stream` — cabe no contrato v1 (`_shared/contracts.ts:60-78`). Use a forma de
   `oracle-council/index.ts:172-189`, repassando o header do usuário, com
   `x-caller-function: quick-agent-test`.
3. **Limite o modelo mesmo depois de rotear.** O gateway aplica orçamento, mas quem escolhe
   `anthropic/claude-3-opus` gasta 30× mais por token que o padrão. A function já tem o lugar certo para
   isso: `mapModel` (`:44-54`) é uma lista fechada de modelos — mantenha-a e **rejeite** (400) o que não
   casar, em vez de cair no `return 'google/gemini-3-flash-preview'` genérico da linha 53.
4. **Atalho tentador a evitar:** deixar a function como está e "proteger" pelo `verify_jwt` da etapa 007.
   O JWT do gateway garante "é um usuário logado qualquer" — não garante orçamento, não grava consumo e não
   impede que um usuário logado rode o endpoint em laço. Religar o JWT é necessário e insuficiente; está
   escrito assim na própria etapa 007.
5. Atualize o `curl` de exemplo da UI no mesmo PR (ver arquivos) — senão a tela continua ensinando uma
   chamada que agora devolve 401, e isso vira chamado de suporte.

**Arquivos e objetos a tocar:** `supabase/functions/quick-agent-test/index.ts`;
`src/components/agents/wizard/quickSteps/RealExamplePreview.tsx:131-139` (o `curl` de exemplo).

**Não tocar / armadilhas:** não altere `appendSkillsToPrompt` nem `countInjectedSkills` — a contagem de
skills injetadas é a fonte da verdade da UI (`:97`). **Armadilha:** há **dois** chamadores no front,
`RealExamplePreview.tsx:161` e `QuickAgentTestPanel.tsx:125`, ambos via
`supabaseExternal.functions.invoke`, que repassa o JWT automaticamente — eles continuam funcionando para
usuário logado. O que quebra é só o `curl` copiado da tela. Lembre: **o front não é publicado no merge**
(DEPLOY-01), então o `curl` corrigido só chega ao usuário quando alguém publicar o front.

**Depende de:** 007, 033 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:**

```
curl -s -o /dev/null -w "%{http_code}" -X POST https://qdlnzopxrlsoljcrcmzv.supabase.co/functions/v1/quick-agent-test \
  -H 'content-type: application/json' \
  -d '{"system_prompt":"oi","user_message":"oi","model":"gpt-4o"}'
```

Esperado **401** (hoje responde e gasta). Depois, com JWT válido e `"model":"modelo-inexistente"` →
esperado **400**, não o fallback silencioso de hoje. Registre os dois.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 043 — `skill-classify-llm`: aplicar `check_budget` antes da chamada paga

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (5 de 7)

**Problema hoje — correção de uma parte da evidência do achado.** A parte de **custo** confere:
`supabase/functions/skill-classify-llm/index.ts:31` importa `ai-provider` e `:177-192` chama a OpenRouter
direto com a chave do dono (`:180`), sem nenhuma verificação de orçamento e sem gravar consumo.
**Mas a parte "sem autenticação" não se confirma — `HIPÓTESE — NÃO VERIFICADO` no achado, e o que encontrei
no lugar foi:** `:134-135` faz

```ts
const userId = await getAuthUserId(req);
if (!userId) return json({ error: 'Não autenticado' }, 401, corsHeaders);
```

e `getAuthUserId` (`supabase/functions/_shared/auth.ts:128-140`) **valida o token de verdade** — cria o
client com a anon key mais o header do chamador e chama `supabase.auth.getUser()`, devolvendo `null` se não
houver usuário. Ou seja, esta function **não** é anonimamente acessível, e o comentário da `:133`
("verify_jwt = false é o padrão do deploy; a validação é feita aqui") mostra que foi deliberado. A listagem
de "24 functions sem autenticação" (`fns-sem-autenticacao.txt`) a incluiu por falso positivo: a varredura
procurava `authenticateRequest` e não reconhecia `getAuthUserId`. **Vale para esta etapa e para a 044 —
e vale conferir antes de executar qualquer etapa da faixa 008–031.**

**Causa raiz (do que de fato está aberto):** a chamada paga não passa pelo único ponto que aplica orçamento.

**Caminho recomendado:**

1. **Não roteie pelo `llm-gateway` aqui, e a razão é verificável:** a chamada usa `tools: [CLASSIFY_TOOL]` e
   `tool_choice: { type: 'function', function: { name: 'classificar_departamento' } }` (`:190-191`), e o
   gateway **não repassa `tools`** — `grep -n "tools" supabase/functions/llm-gateway/index.ts` devolve
   **zero** ocorrências, embora o contrato v2 os aceite (`_shared/contracts.ts:98-108`). Rotear faria o
   modelo responder em texto livre em vez de chamar a ferramenta, e o parser do veredito (`:200+`) passaria
   a falhar — quebra silenciosa, com o departamento virando "indefinido".
2. Aplique o orçamento na própria function, logo depois do `userId` da linha 134 e **antes** do `fetch` da
   linha 177: resolva o workspace por `workspace_members` (padrão de `llm-gateway/index.ts:751-756`) e chame
   `rpc('check_budget', { p_workspace_id })` (padrão de `llm-gateway/index.ts:267`). Recuse com **402** e um
   `reason` legível quando `configured && !allowed`.
3. Reaproveite o tratamento de status que a function já tem: `:197-205` repassa 429/402 do upstream porque a
   fila do cliente depende disso (`skillReclassificationService.ts`). Devolva o 402 de orçamento **no mesmo
   formato**, com `Retry-After` ausente — assim o cliente desiste do lote em vez de insistir.
4. **Atalho tentador a evitar:** criar um helper novo `_shared/budget.ts` nesta etapa e já converter as
   outras functions para ele. O helper é desejável, mas é a unificação do COST-03 (etapas 101–104); fazer
   agora transforma uma etapa atômica em refatoração de 7 arquivos e some com a possibilidade de reverter
   uma function isolada.

**Arquivos e objetos a tocar:** `supabase/functions/skill-classify-llm/index.ts` (bloco entre `:134` e
`:177`).

**Não tocar / armadilhas:** não altere `CLASSIFY_TOOL` (`:95-117`), `SKILL_DEPARTMENTS` nem o
`departments.ts` — `src/test/skill-departments-parity.test.ts:30-38` compara o arquivo da edge com o do front
e **quebra o CI** se a lista divergir. Não mexa no `CLASSIFY_RATE_LIMIT`.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** baixo — quem está dentro do orçamento não percebe diferença. Reverter:
`git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `npx vitest run src/test/skill-departments-parity.test.ts` (tem de continuar verde). E,
em ambiente descartável ou com um workspace de teste com `workspace_budgets.hard_stop = true` e limite
atingido: chamada autenticada → **402**, e nenhuma requisição à OpenRouter no log da function. Sem acesso ao
banco, a verificação de orçamento fica NÃO VERIFICADA — registre assim, e confirme ao menos que a chamada
sem JWT continua devolvendo 401 (comportamento que já existe hoje e não pode regredir).

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 044 — `skill-describe-llm`: aplicar `check_budget` antes da chamada paga

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (6 de 7)

**Problema hoje:** gêmea da etapa 043. `supabase/functions/skill-describe-llm/index.ts:38` importa
`ai-provider`; `:295-309` chama a OpenRouter direto com a chave do dono (`:298`), com `tools: [DESCRIBE_TOOL]`
e `tool_choice` (`:308-309`), sem orçamento e sem registro de consumo. E há **mais de uma** chamada no
arquivo: `aiModel(MODEL)` aparece em `:268`, `:302` e `:378` — confirme se são caminhos alternativos
(retry/fallback) ou chamadas adicionais, porque cada uma é um ponto de gasto a cobrir.
**Mesma correção de evidência da etapa 043:** a afirmação de que esta function é pública **não se confirma**
— `:239-240` faz `getAuthUserId(req)` e devolve 401 sem usuário (`HIPÓTESE — NÃO VERIFICADO` no achado;
o que está no código é autenticação válida, via `_shared/auth.ts:128-140`).

**Causa raiz:** a mesma da 043.

**Caminho recomendado:** idêntico ao da etapa 043 — `check_budget` local, **não** roteamento pelo gateway,
pelo mesmo motivo verificável (o gateway não repassa `tools`; zero ocorrências de `tools` em
`llm-gateway/index.ts`). Faça **depois da 043** e copie a mesma forma, para que as duas fiquem idênticas e a
unificação posterior (COST-03, etapas 101–104) seja mecânica.
**Diferença de atenção:** antes de escrever, mapeie os três pontos de `aiModel(MODEL)` (`:268`, `:302`,
`:378`) e cubra **todos** — uma verificação de orçamento que protege só um dos três caminhos é pior que
nenhuma, porque passa a impressão de que o gasto está contido.
**Atalho tentador a evitar:** o mesmo da 043 — não antecipe o helper compartilhado de orçamento.

**Arquivos e objetos a tocar:** `supabase/functions/skill-describe-llm/index.ts`.

**Não tocar / armadilhas:** não altere `DESCRIBE_TOOL` nem o texto gerado — `src/test/skill-description-parity.test.ts:8-14`
lê este arquivo e compara com `src/lib/skills/descriptionEnrichment.ts:201+`; divergência **quebra o CI**.

**Depende de:** 043 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `npx vitest run src/test/skill-description-parity.test.ts` verde; e a mesma bateria da
043 (chamada autenticada com orçamento estourado → 402 sem chamada paga; sem JWT → 401). Registre também,
explicitamente, **quais dos três pontos de chamada** você cobriu e como comprovou.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 045 — `visual-search`: aplicar `check_budget` antes da chamada de visão

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge) + Custo
**Achados resolvidos:** COST-01 (7 de 7)

**Problema hoje:** `supabase/functions/visual-search/index.ts:21` importa `AI_API_KEY_ENV` e
`AI_CHAT_COMPLETIONS_URL`; `:79` lê a chave e `:82-105` chama o modelo de visão direto com ela. Li `:48-79`:
**não há autenticação nenhuma** — CORS, `checkRateLimit(identifier, RATE_LIMITS.heavy)` (`:52-54`), validação
do payload (`:57-66`) e chamada paga. O corpo aceita `image` como base64 (`:76-78`), isto é, **qualquer
pessoa pode enviar imagens arbitrárias para processamento pago**, que é a chamada mais cara dos 7 casos por
unidade. E `:141-150` ainda encaminha para `semantic-search` com `Bearer ${SERVICE_KEY}` — esse é o achado
SEC-04, tratado na etapa 036.

**Causa raiz:** a mesma das 039–044; agravada por ser entrada multimodal, onde o custo por requisição é
ditado pelo tamanho da imagem que o chamador escolhe enviar.

**Caminho recomendado:**

1. Faça **depois da etapa 036**, que decide o desfecho de SEC-04 e já introduz `authenticateRequest` nesta
   function. Se você fizer antes, vai escrever a autenticação duas vezes e as duas PRs vão conflitar no
   mesmo bloco.
2. **Não tente rotear pelo `llm-gateway`, e aqui a razão é dura:** o contrato do gateway define
   `content: z.string().min(1)` (`supabase/functions/_shared/contracts.ts:66`), e esta chamada envia
   `content` como **array** com `{type:'text'}` + `{type:'image_url'}` (`:91-99`). O payload seria rejeitado
   com 400 na validação, antes de qualquer coisa. Estender o contrato para multimodal é trabalho real e
   pertence à unificação do COST-03 (etapas 101–104), não a esta etapa.
3. Aplique `check_budget` local, com workspace resolvido no servidor, nos mesmos moldes das etapas 043/044,
   **antes** do `fetch` da linha 82.
4. Acrescente um teto de tamanho da imagem antes de gastar: o payload já é validado por
   `VisualSearchBodySchema` (`:57-58`) — ponha ali um limite de bytes do base64. Sem isso, o orçamento é
   verificado mas uma única imagem gigante ainda consome o que quiser dentro do limite.
5. **Atalho tentador a evitar:** deletar a function por ela possivelmente estar quebrada (o desfecho (b) do
   SEC-04). Essa decisão é da etapa 036, e tem de ser tomada **com o resultado do teste dela**, não aqui.
   Se a 036 concluir pela remoção, esta etapa deixa de existir — registre isso no progresso em vez de
   executar as duas em paralelo.

**Arquivos e objetos a tocar:** `supabase/functions/visual-search/index.ts` (bloco `:48-105` e o
`VisualSearchBodySchema`).

**Não tocar / armadilhas:** não toque no `VISION_PROMPT` nem no encaminhamento para `semantic-search`
(`:141-150`) — isso é da etapa 036. **Armadilha:** `src/services/searchService.ts:56` chama por
`supabase.functions.invoke("visual-search", …)`, que repassa o JWT; o front não muda. Segunda armadilha: o
custo de visão **não** é contabilizável por `aiCostUsd` — `google/gemini-2.5-flash` não está nas 3 linhas de
`PRICES_PER_1M` (`_shared/ai-provider.ts:37-41`), então a função devolve `null` e o gasto segue invisível
mesmo depois desta etapa. Diga isso no corpo da PR; é o COST-03 que fecha.

**Depende de:** 036 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** chamada sem JWT → **401** (depois da 036). Com JWT e orçamento estourado → **402 sem
chamada ao modelo de visão** (confirme pelo log da function que o `fetch` não saiu). Com imagem acima do
teto → **400**. A parte de orçamento exige banco e usuário de teste; sem eles, registre NÃO VERIFICADO e
entregue ao menos os casos 401 e 400, que não dependem de nada externo.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 046 — Gerar os códigos de recuperação do 2FA com `crypto.getRandomValues`

**Onda / Severidade / Camada:** 1 / **Alta** / Hooks / Segurança
**Achados resolvidos:** SEC-11

**Problema hoje:** `src/hooks/use2FA.ts:48`:

```ts
const backupCodes = Array.from({ length: 8 }, () =>
  Math.random().toString(36).slice(2, 10).toUpperCase(),
);
```

e `:50-51` grava os 8 em `user_2fa.backup_codes`. Três defeitos na mesma linha:

1. `Math.random()` **não é criptográfico**: o gerador do V8 (xorshift128+) tem estado recuperável a partir de
   algumas saídas, e os 8 códigos saem **em sequência do mesmo estado** — quem obtiver um deriva os outros.
2. **Comprimento variável**: `Math.random().toString(36)` produz string de tamanho variável, então
   `.slice(2, 10)` pode devolver **menos de 8 caracteres**.
3. Entropia máxima ~41 bits, e na prática menor pelo item 1.

É a credencial que **contorna** o segundo fator — o que vale quando o usuário perde o celular.

**Causa raiz:** uso do gerador de conveniência onde o requisito é imprevisibilidade. A API correta já é usada
em três lugares deste repositório.

**Caminho recomendado:**

1. Troque a geração por `crypto.getRandomValues` com alfabeto e comprimento **fixos**. O padrão já existe em
   `src/services/e2eeService.ts:98-99` e `src/services/credentialVaultService.ts:56` (front) e em
   `supabase/functions/_shared/otel-edge.ts:43-47` (edge) — siga a forma de lá: alocar `Uint8Array`, preencher
   com `crypto.getRandomValues`, mapear byte a byte para o alfabeto.
2. Use alfabeto sem caracteres ambíguos (sem `O`, `0`, `I`, `1`) e **10 caracteres** por código: o usuário vai
   transcrever esses códigos à mão de um papel. E **evite o módulo enviesado**: `byte % alfabeto.length` não
   distribui por igual quando 256 não é múltiplo do tamanho; descarte os bytes acima do maior múltiplo, ou
   use um alfabeto de 32 símbolos (256 é múltiplo de 32) — o caminho mais simples e sem viés.
3. **Atalho tentador a evitar:** chamar `crypto.randomUUID()` 8 vezes. Funciona do ponto de vista de entropia,
   mas produz 36 caracteres com hífens — ninguém digita isso de um papel, e a feature vira inútil na hora em
   que é necessária. O requisito aqui é "imprevisível **e** transcritível".
4. **Antes de escrever, saiba o que esta correção não resolve** (e registre no corpo da PR, porque muda a
   leitura do dono): **não existe, em lugar nenhum do repositório, código que verifique um código de
   recuperação.** Medido: `grep -rn "backup_codes\|backupCodes" src/ supabase/functions/` devolve apenas a
   geração (`use2FA.ts:48,51,55`), a exibição na tela (`TwoFactorSetup.tsx:20,67-73`) e o tipo gerado
   (`types.ts:12710,12720`). Nenhum fluxo de login os consome. Ou seja: hoje os códigos são impressos e nunca
   resgatados. Esta etapa conserta o gerador — **o fluxo de resgate é funcionalidade que não existe**, e isso
   merece uma etapa própria (abra-a no progresso; não a improvise aqui).
5. Também **não** conserte nesta etapa: a violação do ADR-006 na linha 49
   (`supabase as unknown as {…}` — o client de **auth** fazendo `from()`, quando o ADR manda usar o
   `externalClient` para todo `from()`/RPC) nem o cast que contorna a tipagem. É o achado ADR-01, com etapa
   própria, e misturar os dois faz esta PR tocar a camada de integração sem necessidade. Deixe a linha 49
   como está.

**Arquivos e objetos a tocar:** `src/hooks/use2FA.ts` (só a linha 48 e, se precisar, uma função auxiliar
nova no mesmo arquivo); um teste novo em `src/test/` (ver verificação).

**Não tocar / armadilhas:** não toque em `generateSecret` (`:31-35`) nem em `verifyToken` (`:37-43`) — o TOTP
está correto (usa `otpauth` com `Secret({ size: 20 })`). Não mude a coluna `backup_codes` nem o formato do
upsert. **Armadilha:** quem já habilitou o 2FA continua com os códigos fracos gravados — a correção **não**
regenera nada retroativamente. Diga isso ao dono; se houver usuários com 2FA ativo (não verificável nesta
sessão, sem acesso ao banco), eles precisam desabilitar e reabilitar.

**Depende de:** — · **Libera:** —

**Risco e como reverter:** baixo e isolado a um hook. Reverter: `git revert`. **Lembre:** merge **não**
publica o front (DEPLOY-01) — esta correção só chega ao usuário quando alguém publicar o front-end; não
escreva na PR que "está em produção".

**Precisa de aprovação humana antes do merge:** **não** — mudança de código isolada a um hook,
sem DDL, sem segredo, sem workflow. (Os códigos de backup já emitidos continuam fracos: a rotação
deles é decisão do dono e vira anotação no progresso.)

**Como verificar:** teste unitário novo, no padrão de `src/test/hooks.test.ts`, que gere 1.000 códigos e
afirme: (a) todos com exatamente o comprimento escolhido; (b) zero duplicatas; (c) todos os caracteres dentro
do alfabeto. Rode `npx vitest run src/test/<novo>.test.ts` e registre a saída. Teste negativo que prova o
valor: rodando a mesma asserção (a) contra a implementação antiga, ela **falha** — anexe essa saída também,
porque é a prova de que o comprimento variável era real.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 047 — Servir os três cabeçalhos de segurança como cabeçalho HTTP no Vite (dev e preview)

**Onda / Severidade / Camada:** 1 / **Alta** / Interface / Build
**Achados resolvidos:** SEC-HDR-01 (1 de 6)

**Problema hoje:** `index.html:8,9,10` declara `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` e
`Permissions-Policy: …` como `<meta http-equiv>`. **Os três são ignorados pelo navegador nessa forma** — o
próprio Chromium diz, e foi capturado em 10 de 10 carregamentos das rotas públicas:
`X-Frame-Options may only be set via an HTTP header sent along with a document. It may not be set inside
<meta>`. Resultado: **não existe proteção contra clickjacking**. A CSP de `index.html:12` vale em meta, mas
não tem `frame-ancestors` — e `frame-ancestors` também é ignorado em meta, que é a etapa 050.
Não há nada no repositório que sirva cabeçalho: não existe `vercel.json` nem `.vercel/`, e o único servidor
que o repositório controla é o do Vite.

**Causa raiz:** o mecanismo escolhido (meta tag) não é capaz de produzir o efeito pretendido (cabeçalho
HTTP), e nada no projeto comparava a intenção declarada com o efeito.

**Caminho recomendado:**

1. Acrescente `headers` em **`server`** e em **`preview`** no `vite.config.ts`. O bloco `server` já existe
   (`vite.config.ts:13-19`); `preview` precisa ser criado. Os três cabeçalhos: `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff` e o `Permissions-Policy` com o mesmo conteúdo de `index.html:10`.
2. **Defina o conteúdo em uma constante só, no topo do `vite.config.ts`**, usada pelos dois blocos. Dois
   literais iguais divergem na primeira edição — e a divergência entre o que está escrito e o que está em
   vigor é exatamente a causa raiz desta auditoria.
3. **Diga, no comentário do código e no corpo da PR, o que isto NÃO faz:** o servidor do Vite serve
   desenvolvimento e preview. **Produção é o Lovable** e não lê este arquivo. Esta etapa torna o cabeçalho
   real onde o teste roda (é o que destrava a etapa 048) e **não** fecha o clickjacking em produção — isso é
   a etapa 051. Escrever "cabeçalhos de segurança implementados" no título da PR seria repetir o defeito.
4. **Atalho tentador a evitar:** criar um plugin de Vite que injete os cabeçalhos no `dist/`. Não existe
   isso: cabeçalho HTTP é emitido por quem **serve** o arquivo; nenhum conteúdo dentro do `dist/` consegue
   produzi-lo. Qualquer solução "no build" é ilusão.

**Arquivos e objetos a tocar:** `vite.config.ts` (bloco `server` existente + bloco `preview` novo + a
constante compartilhada).

**Não tocar / armadilhas:** não remova ainda as metas do `index.html` — isso é a etapa 049, e fazer junto
impede que você prove, no console, que a mensagem de erro do navegador sumiu por causa da meta e não do
cabeçalho. Não toque na CSP nesta etapa (etapa 050). **Armadilha:** o Playwright sobe o servidor com
`npm run dev` (`playwright.config.ts:20-25`), não com `preview` — então é o bloco `server` que faz o teste da
etapa 048 passar. Configure os dois mesmo assim, senão o `vite preview` continua sem cabeçalho e a diferença
volta a aparecer depois.

**Depende de:** — · **Libera:** 048, 050

**Risco e como reverter:** baixíssimo — só muda o servidor de desenvolvimento. `X-Frame-Options: DENY` impede
embutir a aplicação em iframe; se alguma ferramenta local (o preview do Lovable, por exemplo) depender de
iframe para o `localhost:8080`, ela quebra — teste antes de mergear. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não** (configuração de build local, sem workflow, sem
segredo, sem infraestrutura).

**Como verificar:**

```
npm run dev &
curl -sI http://localhost:8080/ | grep -iE 'x-frame-options|x-content-type-options|permissions-policy'
```

Esperado: as três linhas presentes. Hoje: nenhuma. Registre o antes e o depois.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 048 — `e2e/security.spec.ts`: verificar o cabeçalho em vigor, não o texto da meta tag

**Onda / Severidade / Camada:** 1 / **Alta** / Testes (E2E)
**Achados resolvidos:** SEC-HDR-01 (2 de 6)

**Problema hoje:** os 5 testes de `e2e/security.spec.ts` passam — e não verificam nada do que importa:

- `:13-19` afirma que **existe a meta tag** `X-Frame-Options` com conteúdo `DENY`
  (`page.locator('meta[http-equiv="X-Frame-Options"]')` + `getAttribute("content")`);
- `:29-36` faz o mesmo com `Permissions-Policy`;
- `:4-11` com a CSP; `:21-27` com `meta[name="referrer"]`.
  Nenhum deles chama `response.headers()`. Testam **que a string está no arquivo**, não que a proteção está em
  vigor — e por isso o defeito sobreviveu com o CI verde: 31 de 31 testes passando com clickjacking aberto.

**Causa raiz:** o teste foi escrito contra o mecanismo (a meta tag) em vez de contra o efeito (o cabeçalho
recebido pelo navegador). É a mesma forma do SEC-02 (manifest × deploy) e do VIS-01 (baseline regravada antes
da comparação): **o guard mede a intenção declarada, não o resultado**.

**Caminho recomendado:**

1. Troque a origem da asserção: `const response = await page.goto("/");` e depois
   `const headers = response!.headers();`, afirmando sobre `headers['x-frame-options']`,
   `headers['x-content-type-options']` e `headers['permissions-policy']` (nomes em minúsculas — o Playwright
   normaliza).
2. **Mantenha um teste separado para a CSP em meta.** A CSP é o único dos quatro que **funciona** em meta
   (exceto `frame-ancestors` e `sandbox`), então a asserção sobre `index.html:12` continua legítima — só não
   pode mais ser a única. Quando a etapa 050 passar a CSP também para cabeçalho, acrescente a asserção sobre
   o cabeçalho sem apagar a da meta.
3. Faça **depois da etapa 047**, senão o teste fica vermelho sem que haja o que consertar no PR. Se você
   precisar inverter a ordem, marque os testes novos com `test.fail()` e remova a marca na 047 — mas prefira
   a ordem natural.
4. **Atalho tentador a evitar:** apontar o teste para a URL de produção
   (`PLAYWRIGHT_BASE_URL=https://superagent-lab.lovable.app`) para "testar o que vale de verdade". Isso
   deixaria o CI dependente de um serviço externo e de uma versão de front **que está 11 dias atrasada**
   (achado DEPLOY-01) — testes vermelhos por motivo errado. A verificação de produção existe e é a etapa 051,
   com `curl`, feita por quem tem o painel.

**Arquivos e objetos a tocar:** `e2e/security.spec.ts`.

**Não tocar / armadilhas:** não toque no teste `"no inline scripts violate CSP"` (`:38-50`) — ele já observa
comportamento (erros de console) e está certo. **Armadilha:** `E2E Tests` **não é check obrigatório** e roda
só em `pull_request` (`ci.yml`, job `e2e-tests` com `if: pull_request`); então este teste, mesmo correto, não
barra nada ainda. Barrar é a etapa 052. Segunda armadilha: a suíte de E2E depende do ffmpeg
(`playwright.config.ts:18` → `video: 'retain-on-failure'`), ausente no runner — medido: 26 de 26 falharam por
isso e 31 passaram após `npx playwright install ffmpeg`. Se os seus testes falharem com erro de ffmpeg, o
problema não é o seu código (achado E2E-01, etapas 084–087).

**Depende de:** 047 · **Libera:** 052

**Risco e como reverter:** nenhum para produção — é teste. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `npx playwright test e2e/security.spec.ts` → 5 passam **com a 047 aplicada**. Teste
negativo que prova o valor do guard: comente o bloco `headers` do `vite.config.ts` e rode de novo → os três
testes de cabeçalho têm de **falhar**. Registre as duas saídas; sem a segunda, você não provou nada.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 049 — Remover do `index.html` as três metas de segurança que o navegador ignora

**Onda / Severidade / Camada:** 1 / **Média** / Interface
**Achados resolvidos:** SEC-HDR-01 (3 de 6)

**Problema hoje:** `index.html:7` tem o comentário `<!-- Security Headers (meta-based) -->` e `:8,9,10`
declaram `X-Frame-Options`, `X-Content-Type-Options` e `Permissions-Policy` em `<meta http-equiv>`. As três
são inertes — o navegador recusa explicitamente a primeira em cada carregamento, e as outras duas simplesmente
não têm efeito nessa forma. Enquanto elas estiverem ali, qualquer pessoa que abra o arquivo (ou qualquer
agente que leia o repositório) conclui que a proteção existe. Foi o que aconteceu: existem **5 testes
versionados** afirmando isso (etapa 048).

**Causa raiz:** a mesma do resto do SEC-HDR-01 — declaração sem efeito mantida no lugar onde ela parece ser a
implementação.

**Caminho recomendado:**

1. Remova as linhas 8, 9 e 10 e troque o comentário da linha 7 por um que diga **onde os cabeçalhos passam a
   ser definidos**, nomeando os dois lugares: `vite.config.ts` (dev/preview, etapa 047) e a configuração do
   host de produção (etapa 051). Um comentário que só diz "removido" devolve a dúvida ao próximo leitor.
2. **Mantenha** a linha 11 (`<meta name="referrer" content="strict-origin-when-cross-origin">`) e a linha 12
   (CSP). Essas duas **funcionam** em meta — remover por simetria seria tirar proteção real.
3. Faça **depois da 047 e da 048**: remover as metas antes de os cabeçalhos existirem deixa uma janela em que
   nem uma coisa nem outra está no lugar, e deixa os testes da 048 vermelhos por dois motivos ao mesmo tempo.
4. **Atalho tentador a evitar:** "melhorar" as metas em vez de removê-las — por exemplo trocar
   `X-Frame-Options` por um `<meta>` de CSP com `frame-ancestors`. `frame-ancestors` é **ignorado quando a
   CSP vem por meta**; o resultado seria trocar uma declaração inerte por outra, com aparência mais moderna.

**Arquivos e objetos a tocar:** `index.html` (linhas 7 a 10).

**Não tocar / armadilhas:** não toque na linha 17 (`dns-prefetch` para `qdlnzopxrlsoljcrcmzv.supabase.co`) —
ela está **correta** no HEAD e é a prova usada no achado DEPLOY-01 de que produção está desatualizada
(produção ainda serve `tdprnylgyrogbbhgdoik`). Mudá-la destrói a evidência. Não toque no bloco de fontes
(`:14-29`). **Armadilha:** como o front **não é publicado no merge**, produção vai continuar servindo o HTML
antigo **com** as metas por tempo indefinido — a remoção não piora nada lá, porque elas já não tinham efeito.

**Depende de:** 047, 048 · **Libera:** —

**Risco e como reverter:** nenhum efeito funcional (as três linhas não fazem nada hoje). Reverter:
`git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** `grep -n 'http-equiv' index.html` → devem sobrar apenas a CSP (linha 12) e nenhuma das
três removidas. `npx playwright test e2e/security.spec.ts` continua verde (porque a 048 já lê cabeçalho, não
meta). E, no console do navegador em `npm run dev`, a mensagem `X-Frame-Options may only be set via an HTTP
header…` **desaparece** — registre o console antes e depois.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 050 — Entregar a CSP também como cabeçalho, com `frame-ancestors 'none'`

**Onda / Severidade / Camada:** 1 / **Alta** / Interface / Build
**Achados resolvidos:** SEC-HDR-01 (4 de 6)

**Problema hoje:** a CSP de `index.html:12` tem `frame-src 'self' https://*.lovable.app
https://*.lovable.dev` — isto é, **quem a página pode embutir** — e **não tem `frame-ancestors`**, que é
**quem pode embutir a página**. As duas diretivas são frequentemente confundidas, e é exatamente a segunda
que substitui o `X-Frame-Options`. Pior: mesmo que você acrescentasse `frame-ancestors` à meta da linha 12,
**ele seria ignorado** — `frame-ancestors` e `sandbox` são as duas diretivas que não valem em
`<meta http-equiv>`. Portanto, hoje, a defesa contra clickjacking depende inteiramente do
`X-Frame-Options` que a etapa 047 passou a servir, sem nenhuma segunda camada.

**Causa raiz:** a CSP foi escrita para um meio (meta tag) que não suporta a diretiva que faltava, e a lacuna
não aparece em nenhuma leitura do arquivo — só numa requisição real.

**Caminho recomendado:**

1. Mova o texto da CSP para a mesma constante criada na etapa 047 no `vite.config.ts`, e sirva-a como
   cabeçalho `Content-Security-Policy` em `server` e `preview`, **acrescentando `frame-ancestors 'none';`**.
2. **Mantenha a meta da linha 12 como está, com o mesmo conteúdo menos o `frame-ancestors`.** Duas razões
   concretas: (a) produção serve HTML antigo e não lê o `vite.config.ts` — a meta é a única CSP que o usuário
   do Lovable recebe hoje; (b) a meta protege também o caso em que o host de produção não for configurado.
   Deixe um comentário em cada lado apontando para o outro, para não divergirem.
3. **Não copie a CSP de produção.** A que está no ar **não é** a do repositório: medido, falta nela
   `*.lovable.app`, `*.lovable.dev`, `cdn.gpteng.co`, `*.sentry.io` em `connect-src`, e faltam `media-src` e
   `form-action` (achado DEPLOY-01). Partir da versão em produção seria regredir — a do HEAD é a boa.
4. **Atalho tentador a evitar:** acrescentar `'unsafe-inline'`/`'unsafe-eval'` novos ou alargar `connect-src`
   "para não quebrar nada". A CSP do HEAD já tem `'unsafe-inline'` e `'unsafe-eval'` em `script-src` por
   causa do Vite; não acrescente mais nada sem medir qual recurso foi bloqueado. Se algo quebrar, o console
   diz exatamente qual diretiva e qual URL.
5. Antes de mergear, carregue as 5 rotas públicas com o cabeçalho ligado e leia o console: zero violação de
   CSP nova. O teste `"no inline scripts violate CSP"` (`e2e/security.spec.ts:38-50`) já faz essa checagem —
   use-o.

**Arquivos e objetos a tocar:** `vite.config.ts` (a constante e os blocos `server`/`preview`);
`e2e/security.spec.ts` (acrescentar a asserção de `frame-ancestors` no cabeçalho, sem remover a da meta).

**Não tocar / armadilhas:** não remova `frame-src` — ele continua necessário, é outra coisa. **Armadilha:**
`frame-ancestors 'none'` impede que a aplicação seja aberta dentro de iframe **por qualquer um, inclusive o
preview do Lovable**. Se o fluxo de trabalho do dono usa esse preview, use `frame-ancestors 'self'
https://*.lovable.app https://*.lovable.dev` e registre a escolha com a justificativa — mas então o
`X-Frame-Options: DENY` da etapa 047 passa a contradizer a CSP (navegadores modernos preferem
`frame-ancestors`, os antigos obedecem ao `X-Frame-Options`); nesse caso troque o `X-Frame-Options` para
`SAMEORIGIN` para os dois dizerem a mesma coisa. **Decida isto com o dono antes de escrever.**

**Depende de:** 047 · **Libera:** 051

**Risco e como reverter:** médio — CSP mal ajustada quebra a aplicação inteira de uma vez, e em
desenvolvimento isso aparece como tela branca. Reverter: `git revert` (só afeta dev/preview; produção não lê
este arquivo).

**Precisa de aprovação humana antes do merge:** **não** para o código; **sim** para a decisão do passo
"armadilha" (permitir ou não o iframe do Lovable), que é decisão de fluxo de trabalho do dono.

**Como verificar:**

```
npm run dev &
curl -sI http://localhost:8080/ | grep -i content-security-policy
```

Esperado: a linha presente, contendo `frame-ancestors 'none'` (ou a variante acordada). E
`npx playwright test e2e/security.spec.ts` verde, incluindo o teste de violação de console.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 051 — Corrigir a regra de alteração que deixa mover registro para o workspace de outro cliente

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (RLS) / Multi-inquilino
**Achados resolvidos:** TEN-01

**Problema hoje:** `supabase/migrations/20260905120000_rls_complete_reconciliation.sql:202-204` cria, para
**todas** as tabelas percorridas pelo laço, a policy:

```sql
CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin(auth.uid(), workspace_id))
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) OR user_id = auth.uid())
```

O `WITH CHECK` valida a linha **depois** do UPDATE, e tem **`OR user_id = auth.uid()`**. O usuário passa no
`USING` porque a linha é dele, e passa no `WITH CHECK` pelo **mesmo ramo**, com `workspace_id` valendo
qualquer coisa. Resultado: ele altera a própria linha apontando-a para o workspace de outro cliente.

**Causa raiz:** o `OR user_id = auth.uid()` foi escrito para o caso "o dono edita a própria linha" e, por
estar no `WITH CHECK`, desativou a verificação de inquilino exatamente onde ela importa — no valor novo.
`USING` e `WITH CHECK` respondem perguntas diferentes: _"você pode mexer nesta linha?"_ e _"a linha pode
ficar assim?"_. A condição foi copiada de uma para a outra.

**Caminho recomendado:**

1. Migration nova, aditiva e idempotente, que recrie as policies `*_member_update` com o `WITH CHECK`
   **sem** o ramo de `user_id`:
   `WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))`.
   O `USING` pode continuar como está — ali o `OR user_id = auth.uid()` é legítimo.
2. **Descubra primeiro quais tabelas têm essa policy.** O laço original rodou sobre um conjunto que depende
   do estado do banco; não presuma. Consulta de apoio, só leitura:
   ```sql
   SELECT c.relname, pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE p.polname LIKE '%\_member\_update' AND p.polcmd = 'w';
   ```
3. Faça a correção pelo **mesmo formato de laço** da migration original (`:176-218`), para não deixar
   tabelas de fora — mas **sem** o `EXCEPTION WHEN OTHERS` engolindo erro (ver etapa 052 e achado TEN-06).
4. **Atalho a evitar:** corrigir só as tabelas "importantes". O laço aplicou a mesma policy a dezenas de
   tabelas; qualquer uma esquecida continua sendo porta de entrada, e a próxima auditoria vai reencontrar o
   problema numa tabela que ninguém lembrava.

**Arquivos e objetos a tocar:** uma migration nova em `supabase/migrations/`.

**Não tocar / armadilhas:** não altere as policies `*_member_select` e `*_member_delete` nesta etapa — o
`OR user_id = auth.uid()` nelas está em `USING`, onde é correto. Não mexa na migration original.
**Armadilha:** tabelas sem coluna `workspace_id` vão falhar no `CREATE POLICY`; trate explicitamente em vez
de deixar o erro ser engolido.

**Depende de:** 053 · **Libera:** 052

**Risco e como reverter:** médio — se alguma linha legítima depender do ramo removido, a alteração passa a
ser negada. Teste com usuário real antes de dar a etapa por concluída. Reverter: migration nova que restaure
a condição anterior (estado de banco não volta com `git revert`).

**Precisa de aprovação humana antes do merge:** **sim** — DDL em banco de produção.

**Como verificar:** com um usuário do workspace A, tente mover uma linha sua para o workspace B:
`UPDATE <tabela> SET workspace_id = '<id-do-B>' WHERE id = '<linha-do-A>';`
→ esperado: **0 linhas afetadas / erro de policy**. Hoje a alteração é aceita. Rode em ambiente descartável.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 052 — Corrigir a regra de inserção que permite gravar linha em nome de outra pessoa

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (RLS) / Integridade de auditoria
**Achados resolvidos:** TEN-02

**Problema hoje:** `supabase/migrations/20260905120000_rls_complete_reconciliation.sql:200-201`:

```sql
CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
```

Valida **só** o workspace. **Não valida `user_id = auth.uid()`.** Um membro comum insere linha com o
`user_id` de outra pessoa do mesmo workspace.

**Causa raiz:** a policy foi pensada para isolar clientes e não para garantir autoria. São duas propriedades
diferentes, e só a primeira foi escrita.

**Caminho recomendado:**

1. Migration nova que recrie as `*_member_insert` com
   `WITH CHECK (workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())) AND (user_id IS NULL OR user_id = auth.uid()))`.
   O ramo `user_id IS NULL` é necessário porque nem toda tabela do laço usa `user_id` como autor — algumas o
   usam como _referência_ a um usuário (ex.: destinatário de notificação). **Levante quais são antes**, com a
   mesma consulta da etapa 051 adaptada para `polcmd = 'a'`.
2. Onde `user_id` for referência e não autoria, **não** aplique a condição: documente a exceção na própria
   migration, com o nome da tabela e o motivo.
3. **Atalho a evitar:** resolver isso no código do frontend, preenchendo `user_id` com o usuário da sessão.
   O frontend já faz isso; o problema é que a regra do banco **aceita outro valor**. Pelo ADR-005, a fronteira
   é a RLS.
4. **Por que esta etapa é de integridade, não só de segurança:** `audit_log`, as tabelas de aprovação e as
   `*_runs` são lidas como prova de quem fez o quê. Enquanto esta policy permitir autoria forjada, nenhuma
   decisão tomada a partir delas é defensável.

**Arquivos e objetos a tocar:** uma migration nova em `supabase/migrations/`.

**Não tocar / armadilhas:** o `webhook-receiver` e outras edges escrevem com `service_role`, que ignora RLS —
esta mudança **não** afeta a ingestão automática. Confirme antes de mergear. **Armadilha:** aplicar a
condição a uma tabela onde `user_id` é referência quebra funcionalidade legítima (ex.: atribuir tarefa a
outra pessoa); é por isso que o passo 1 vem antes.

**Depende de:** 051 · **Libera:** —

**Risco e como reverter:** médio pelo motivo da armadilha acima. Reverter: migration nova restaurando a
condição anterior.

**Precisa de aprovação humana antes do merge:** **sim** — DDL em banco de produção.

**Como verificar:** com o usuário A autenticado, tente inserir linha com `user_id` do usuário B:
`INSERT INTO <tabela> (workspace_id, user_id, …) VALUES ('<ws-do-A>', '<id-do-B>', …);`
→ esperado: **erro de policy**. Hoje é aceito. Rode em ambiente descartável.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 053 — Confirmar no banco se `public.exec_sql` ainda está acessível a `anon` — PRIMEIRA ação do executor

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco
**Achados resolvidos:** SEC-EXEC-01

**Esta é, na prática, a primeira coisa a fazer de todo o plano** — antes mesmo da etapa 001. É uma consulta de
**leitura**, custa segundos, e o resultado decide se existe um segundo incidente aberto em paralelo ao do
SEC-01. Se o resultado for ruim, a etapa de revogação passa à frente de tudo.

**Problema hoje:** `ESTADO-ATUAL.md` §4.1 mediu, em 2026-08-16, que `public.exec_sql(query text)` existia em
produção como `SECURITY DEFINER` com `EXECUTE` para `anon` — isto é, **SQL arbitrário com privilégio de
owner, ignorando toda a RLS, chamável por qualquer pessoa pela API REST**. Há correção escrita:
`supabase/migrations/20260905140000_security_hotfix_validation.sql:21-27` faz
`REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated` e
`GRANT EXECUTE … TO service_role`, **condicionado** a `to_regprocedure('public.exec_sql(text)') IS NOT NULL`.
E o `DB Drift Check` de 2026-11-21 indica `repo=338 banco=338`, ou seja, essa migration está registrada.
**Nada disso confirma o estado atual dos grants**, e **não houve acesso ao banco nesta auditoria**
(`docs/qa/01-INVENTARIO.md` §6 — nenhum MCP desta sessão aponta para `qdlnzopxrlsoljcrcmzv`). Status do
achado: **HIPÓTESE — NÃO VERIFICADO**.

**Causa raiz (da incerteza, que é o que esta etapa ataca):** a função foi criada **manualmente no projeto de
produção**, fora do fluxo de migrations — o próprio comentário do hotfix diz isso
(`20260905140000_…sql:19-20`: "exec_sql é RPC SECURITY DEFINER criado manualmente no projeto produção (não
existe em base limpa/preview)"). Objeto criado fora do repositório não aparece em nenhuma verificação que
compare repositório com banco.

**Caminho recomendado:**

1. Consiga leitura no banco oficial `qdlnzopxrlsoljcrcmzv`. O caminho que **existe e já funciona** é o secret
   `DB_MCP_URL`, usado por `.github/workflows/ci.yml:42-47` (`node scripts/db-drift-check.mjs`). Nenhum MCP
   de Supabase desta sessão aponta para o projeto oficial — `AGENTS.md` lista quais apontam para onde, e
   todos são outros sistemas. **Se você não tiver o `DB_MCP_URL`, pare e peça ao dono.** Não infira o estado
   do banco a partir das migrations: foi exatamente o que criou esta incerteza.
2. Consulte **todas as sobrecargas**, não uma assinatura:

```sql
SELECT p.oid::regprocedure                                AS assinatura,
       p.prosecdef                                        AS security_definer,
       pg_get_userbyid(p.proowner)                        AS owner,
       p.proacl                                           AS acl_bruta,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_executa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'exec_sql';
```

3. **Leia o resultado com estes três cuidados**, que é onde um executor apressado erra:
   - **zero linhas** = a função não existe → achado fechado, registre e siga. É o melhor desfecho.
   - `anon_executa = true` → **incidente aberto**: revogue na hora e trate como as etapas 001–005
     (a chave muda tudo de prioridade).
   - `acl_bruta` **nula** (`proacl IS NULL`) significa **privilégio padrão**, que para função é
     `EXECUTE TO PUBLIC` — ou seja, `anon` executa. Não interprete "nulo" como "nenhum acesso".
   - o hotfix cobre só a assinatura `(text)`. Se a consulta devolver **mais de uma linha** (por exemplo
     `exec_sql(text, jsonb)`), as outras **não foram revogadas** por aquela migration, porque
     `to_regprocedure('public.exec_sql(text)')` casa por tipo e só aquele.
4. Aproveite a mesma conexão para conferir os vizinhos que o mesmo hotfix trata
   (`20260905140000_…sql:29-32`): `public.apply_workspace_rls(text)` e `public.cleanup_old_auth_attempts()`.
   É a mesma consulta com outro `proname` — não custa nada e fecha a dúvida junto.
5. Se precisar revogar: **uma migration nova, aditiva e idempotente** (`DO $$ … IF to_regprocedure(...)`),
   nunca editando a migration de 2026-09-05, que é histórico aplicado (`AGENTS.md` → Banco). Revogar de
   `PUBLIC`, `anon` e `authenticated`; manter `service_role`.
6. **Atalho tentador a evitar:** apagar a função (`DROP FUNCTION public.exec_sql`). Parece o mais seguro e
   quebra um consumidor real: `supabase/functions/datahub-query/index.ts:1192` chama
   `client.rpc('exec_sql', { sql })`. Revogar o grant de `anon` resolve a segurança sem apagar nada.
   (Observação que **não** é para corrigir aqui: essa chamada passa o parâmetro como `sql` e a assinatura
   registrada é `exec_sql(query text)` — provavelmente ela já falha sempre, e o código trata como "RPC não
   deployada" em `:1194-1198`. É outro achado, com etapa própria; não misture.)

**Arquivos e objetos a tocar:** nenhum arquivo, se o resultado for benigno. Se houver revogação: uma migration
nova em `supabase/migrations/`.

**Não tocar / armadilhas:** não execute nada que escreva no banco de produção nesta etapa — diagnóstico em
produção é **só leitura** (`AGENTS.md` → Banco). **Armadilha:** não conclua "está fechado" a partir do
`DB Drift Check` verde. Ele valida três invariantes (migrations repo=banco, RLS 100 %, zero escrita `anon`) e
**nenhuma delas é grant de EXECUTE em função** — `scripts/db-drift-check.mjs` não olha `pg_proc`. Um banco
pode estar 100 % verde no drift check com `exec_sql` aberto para `anon`.

**Depende de:** — (executar em paralelo com a 001; não espere por ela) · **Libera:** nada formalmente; um
resultado ruim cria uma etapa de revogação com prioridade sobre todo o resto da Onda 1

**Risco e como reverter:** nenhum — é consulta de leitura. Se houver revogação, o risco é um consumidor
legítimo perder acesso; o único consumidor conhecido usa `service_role`, que continua autorizado.

**Precisa de aprovação humana antes do merge:** **não** para a consulta. **Sim** para a migration de
revogação, se for necessária (DDL em produção).

**Como verificar:** a própria consulta do passo 2 é a verificação. Resultado esperado **depois** de qualquer
revogação: `anon_executa = false` e `auth_executa = false` em **todas** as linhas devolvidas. Cole a tabela
de saída no arquivo de progresso — inclusive quando o resultado for "zero linhas", porque é essa evidência
que permite marcar o achado como fechado em vez de deixá-lo em hipótese por mais uma rodada.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum, salvo revogação)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica a consulta)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 054 — Criar o gate de dependências que separa runtime de dev e tem exceções versionadas

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura (CI)
**Achados resolvidos:** CI-01 (1 de 4)

**Problema hoje:** o check obrigatório `Security Audit` é uma linha só —
`.github/workflows/ci.yml:30`: `npm audit --audit-level=critical --omit=dev`. **Reexecutei o comando exato
nesta sessão:** ele imprime 4 vulnerabilidades (3 moderadas e **1 alta**) e sai **0**. A alta é
`zod <4.6.6` — _"Zod can exhaust memory while validating oversized constrained collections"_
(GHSA-mrhx-c7xc-m3w5) — e `zod` é **dependência direta de runtime** (`package.json:144`,
`"zod": "^3.25.76"`, instalada `3.25.76`). O `npm audit` completo no mesmo instante: **23** (15 moderadas,
6 altas, 2 críticas). Ou seja, o gate deixa passar uma vulnerabilidade **alta e de runtime**, por desenho.
O comentário em `ci.yml:26-29` explica a escolha do `critical`: o `react-router` tem advisories altos
sobrepostos cobrindo todas as versões disponíveis, e não há release que limpe os dois.

**Causa raiz:** um limiar global foi usado para acomodar **uma** exceção conhecida. Com isso, a exceção
deixou de ser visível e passou a valer para tudo — incluindo vulnerabilidades futuras que ninguém decidiu
aceitar.

**Caminho recomendado:**

1. Escreva `scripts/ci/audit-gate.mjs` seguindo o padrão **já existente e consolidado** deste repositório:
   os ratchets. Veja `scripts/ci/lint-ratchet.mjs` + `scripts/ci/eslint-baseline.json` e
   `scripts/ci/implicit-any-ratchet.mjs` + `implicit-any-baseline.json`. A forma é: script lê um JSON de
   baseline versionado, compara com a medição, falha se piorou.
2. Comportamento do script:
   - roda `npm audit --json --omit=dev` (runtime) e `npm audit --json` (tudo);
   - **falha** com qualquer vulnerabilidade `high` ou `critical` **de runtime** que não esteja em
     `scripts/ci/audit-baseline.json`;
   - **apenas relata** (sem falhar) as de dev — hoje são `tinypool` (crítica, via `vitest`) e `vite` (alta),
     que não vão para o navegador do usuário;
   - cada entrada do baseline carrega `advisory`, `pacote`, `motivo` e `revisar_em` (data). Entrada com
     `revisar_em` no passado **faz o gate falhar** — é isso que impede a exceção de virar permanente, que é
     o defeito atual.
3. Popule o baseline **só** com as exceções que existem de verdade e com o motivo medido: as do
   `react-router` descritas em `ci.yml:26-29`. **Não** inclua o `zod` — ele é o objeto das etapas 056 e 057;
   incluí-lo aqui seria usar a nova ferramenta para esconder exatamente o problema que ela deveria expor.
4. Escreva o teste unitário `scripts/ci/audit-gate.unit.mjs` com `node:test`, como os vizinhos
   (`lint-ratchet.unit.mjs` etc.) — o `guards.yml:63` já roda `node --test scripts/ci/*.unit.mjs`, então o
   teste entra no CI sem tocar em workflow nenhum.
5. **Atalho tentador a evitar:** trocar `--audit-level=critical` por `--audit-level=high` e pronto. Isso
   deixaria a `main` vermelha imediatamente por causa do `react-router` (advisories sem versão limpa) e do
   `zod`, e a reação previsível seria voltar para `critical` — ficando pior, porque a tentativa documenta que
   "não dá". A exceção precisa ser nomeada, não embutida no limiar.
6. **Segundo atalho a evitar:** `npm audit fix --force`. Ele instalaria `zod@4.6.7`, **mudança de major**
   (o próprio `npm audit` avisa: _"Will install zod@4.6.7, which is a breaking change"_), sem ninguém decidir.
   Isso é a etapa 056.

**Arquivos e objetos a tocar:** `scripts/ci/audit-gate.mjs`, `scripts/ci/audit-baseline.json`,
`scripts/ci/audit-gate.unit.mjs`. **Nenhum workflow nesta etapa.**

**Não tocar / armadilhas:** não toque em `package.json` nem em `package-lock.json` — há **fila permanente do
Dependabot** nesses dois arquivos e o `AGENTS.md` proíbe mexer sem falar com o dono. Não altere `ci.yml`
nesta etapa (é a 055), para que o script possa ser validado sozinho antes de virar gate. **Armadilha:**
`npm audit` precisa de rede e muda de resultado com o tempo — o script tem de falhar com mensagem clara se o
comando não rodar, e **nunca** sair 0 por não ter conseguido medir. Esse é exatamente o defeito do CI-02
(etapa 058); não o repita aqui.

**Depende de:** — · **Libera:** 055, 056

**Risco e como reverter:** nenhum enquanto não estiver ligado ao CI. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não** (código de script em `scripts/`, sem workflow).

**Como verificar:** `node scripts/ci/audit-gate.mjs` → hoje tem de sair **diferente de 0**, citando
`zod` / GHSA-mrhx-c7xc-m3w5 como vulnerabilidade alta de runtime fora do baseline. E
`node --test scripts/ci/audit-gate.unit.mjs` verde. Registre as duas saídas: a primeira é a prova de que o
gate novo pega o que o antigo deixava passar.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 055 — Criar o caminho que atribui papel a um usuário

**Onda / Severidade / Camada:** 1 / **Alta** / RBAC / Fluxo principal
**Achados resolvidos:** RBAC-05

**Problema hoje:** não existe, no produto, nenhuma forma de dar um papel a alguém.

- `assignRole` e `removeRole` (`src/services/rbacService.ts:170-200`) **não têm nenhum chamador**
  (EXECUTADO: grep em `src/`).
- `updateMemberRole` (`src/services/teamsService.ts:90`) é citada **apenas** por um teste de fumaça que
  verifica `typeof === 'function'` (`src/test/extended-services.test.ts:145`).
- `RolesPage.tsx`, `RolePermissionsPage.tsx` e `PermissionsPage.tsx` (114/145/122 linhas) só listam:
  nenhum `insert`, `update` ou `upsert`.

Logo `user_roles` nunca recebe linha pela interface → `useRBAC` devolve `role = null` → `can()` é falso para
tudo → **as 38 rotas com `ProtectedRoute` não abrem**. O que mascara isso é o gatilho `trg_auto_assign_admin`
(`…000002:232-251`), que dá `workspace_admin` ao **primeiro** membro de cada workspace; com
`useRBAC.ts:105` (`if (role === 'workspace_admin') return true`), esse primeiro usuário vê tudo. Do segundo
em diante, ninguém tem papel.

**Causa raiz:** a camada de leitura do RBAC (telas, hook, policies) foi construída inteira, e a de escrita
nunca foi ligada à interface. O gatilho de auto-atribuição tapou o buraco para o caso de um usuário só, que é
exatamente o cenário em que o sistema foi testado.

**Caminho recomendado:**

1. **Antes de construir tela**, decida com o dono qual dos dois modelos de papel é o oficial — porque existem
   dois, com vocabulários que não se cruzam (achado RBAC-06): `user_roles.role_key`
   (`workspace_admin`, `agent_editor`, `agent_viewer`) e `workspace_members.role`
   (`admin`, `editor`, `viewer`, `operator`). Enquanto houver dois, qualquer tela que você construir vai
   escrever em um e ser lida pelo outro em algum caminho.
2. Ligue a escrita à tela que **já existe**: `src/pages/TeamPage.tsx` tem o fluxo de membros (convite em
   `:63`, remoção em `:122`). O menor caminho é um seletor de papel por membro ali, chamando
   `updateMemberRole`/`assignRole` — não crie tela nova.
3. Envolva a ação com `AccessControl`, como a remoção já é (`:122`), e **não** como o convite, que ficou sem
   (achado RBAC-10).
4. **Atalho a evitar:** depender do gatilho `trg_auto_assign_admin` como mecanismo de atribuição. Ele é um
   paliativo que torna admin quem entrar primeiro — inclusive em workspace criado por engano — e não tem como
   corrigir o resultado depois.
5. Esta etapa **não** resolve a permissão errada das 26 rotas (`settings.api_keys`): isso é outra etapa.

**Arquivos e objetos a tocar:** `src/pages/TeamPage.tsx`; `src/services/teamsService.ts` ou
`src/services/rbacService.ts` (apenas para ligar o que já existe).

**Não tocar / armadilhas:** não altere `useRBAC.ts:105` — o atalho de `workspace_admin` é decisão do ADR-005.
**Armadilha:** `removeMember` (`teamsService.ts:65-73`) apaga só de `workspace_members` e deixa a linha de
`user_roles` viva, mantendo o privilégio (achado RBAC-08) — se você ligar a atribuição sem corrigir a
remoção, passa a ser possível conceder e não conseguir revogar.

**Depende de:** — · **Libera:** 097–100

**Risco e como reverter:** baixo no código; alto no efeito, porque passa a existir concessão de privilégio
onde não existia. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **sim** — muda o modelo de permissão do produto.

**Como verificar:** com dois usuários no mesmo workspace: o admin atribui um papel ao segundo; o segundo
recarrega e **passa a abrir** uma rota que antes recusava. Consulta de apoio:
`SELECT user_id, role_key FROM user_roles WHERE workspace_id = '<ws>';` → a linha nova aparece.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 056 — Fazer o build falhar quando o código lê variável de ambiente que ninguém define

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura / Front-end
**Achados resolvidos:** ENV-01

**Problema hoje:** `VITE_SUPABASE_ANON_KEY` é lida em 5 lugares — `src/stores/oracleStore.ts:167`,
`src/components/knowledge/KnowledgeBaseDetail.tsx:129`, `src/services/codeInterpreterService.ts:59`,
`src/lib/otel-genai.ts:91`, `src/pages/ComputerUsePage.tsx:46` — e **não existe**: não está no
`.env.example` e não é injetada pelo job `Build` (`.github/workflows/ci.yml:205-208`, que injeta só
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`).
A prova está no bundle gerado nesta sessão com o mesmo comando do CI:

```
dist/assets/CodeInterpreterPage-BbXteBEF.js : apikey:void 0}
dist/assets/ComputerUsePage-BD9wb91Y.js     : apikey:void 0}
dist/assets/AgentBuilder-DUSYTlOQ.js        : apikey:void 0}
```

`void 0` é `undefined` minificado. Cinco telas mandam requisição sem credencial, em produção.

**Causa raiz:** o nome divergiu (`ANON_KEY` × `PUBLISHABLE_KEY`) e **nada cruza "o que o código lê" com "o
que o build injeta"**. `import.meta.env.X` de variável inexistente é `undefined`, não erro — então o build
fica verde e o defeito só aparece no navegador do usuário.

**Caminho recomendado:**

1. **Corrija primeiro a causa, depois os cinco usos.** A causa é a ausência de verificação: acrescente um
   guard que extraia todos os `import.meta.env.VITE_*` de `src/` e falhe se algum não estiver declarado no
   `.env.example`. O repositório já tem o padrão para isso em `scripts/ci/` (ex.:
   `gerar-matriz-edge-tabela.mjs --check`, chamado por `.github/workflows/guards.yml:124`); siga-o.
2. Só então decida, para cada um dos 5 usos, qual é a variável certa. Em 4 deles o valor serve como `apikey`
   do Supabase, e o nome correto no projeto é `VITE_SUPABASE_PUBLISHABLE_KEY` — **confirme lendo cada
   chamada**, não troque em massa.
3. `src/lib/otel-genai.ts:91-97` é diferente: monta `Authorization: Bearer` com essa variável, em vez do
   token de sessão que as outras chamadas usam. Ali a correção não é renomear, é **usar o token de sessão**.
4. **Atalho a evitar:** adicionar `VITE_SUPABASE_ANON_KEY` ao `.env.example` e ao job `Build` e encerrar.
   Isso faz os cinco caminhos funcionarem e deixa o projeto com três nomes para a mesma chave
   (`ANON_KEY`, `PUBLISHABLE_KEY`, `EXTERNAL_SUPABASE_ANON_KEY`) — o próximo caso já está preparado.

**Arquivos e objetos a tocar:** um guard novo em `scripts/ci/`; `.github/workflows/guards.yml`; os 5 arquivos
listados; `.env.example` se faltar alguma variável legítima.

**Não tocar / armadilhas:** não toque em `src/integrations/supabase/client.ts` nem em `externalClient.ts` —
eles usam os nomes corretos. **Armadilha:** o secret `VITE_SUPABASE_ANON_KEY` **existe** no repositório desde
2026-11-13 e nenhum job o usa; ver o secret na lista não prova que a variável chega ao build.

**Depende de:** — · **Libera:** —

**Risco e como reverter:** baixo. O guard pode acusar outras variáveis ausentes além desta — **isso é o
objetivo**, e cada uma vira anotação no progresso. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **sim** — acrescenta um passo a `.github/workflows/`.

**Como verificar:**

```bash
npx vite build && grep -c "apikey:void 0" dist/assets/*.js
```

Esperado hoje: **≥ 3 arquivos com ocorrência**. Esperado depois: **0**.
E o guard novo deve sair diferente de 0 se você remover uma variável do `.env.example` de propósito.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 057 — Parar de gravar cabeçalho de requisição em `webhook_events`

**Onda / Severidade / Camada:** 1 / **Crítica** / Backend (edge)
**Achados resolvidos:** INT-01

**Problema hoje:** `supabase/functions/webhook-receiver/index.ts:74-77` copia **todos** os cabeçalhos da
requisição, sem allowlist e sem redação:

```ts
const headers: Record<string, string> = {};
req.headers.forEach((v, k) => {
  headers[k] = v;
});
```

e `:198-204` grava esse objeto em `webhook_events.headers`. O mesmo acontece nos caminhos de **rejeição**
(`logEvent`, `:248-258`, chamado em `:83-93`, `:102-112`, `:121-131`, `:138-…`) — até a tentativa recusada
tem seus cabeçalhos persistidos. E `_shared/cors.ts:23-42` admite explicitamente `authorization`,
`x-api-key`, `x-hub-signature-256`, `x-signature` e `x-twilio-signature` na allowlist de CORS: são exatamente
os cabeçalhos que carregam credencial, e são exatamente os que vão para o banco.

**Causa raiz:** "guardar tudo para depoimento forense" aplicado a um campo que recebe credencial de terceiro.
O dado foi tratado como log de depuração, não como segredo.

**Caminho recomendado:**

1. Troque a cópia total por uma **allowlist** dos cabeçalhos que têm valor diagnóstico e não são segredo:
   `content-type`, `user-agent`, `x-forwarded-for`, `x-real-ip`, `x-request-id`, `x-event-type`, e os
   cabeçalhos de assinatura **apenas com o fato de estarem presentes** (ex.: gravar
   `{"x-signature": "<presente>"}`), nunca o valor.
2. Mantenha a captura de `sourceIp` como está (`:80`) — ela lê de `headers` e continua funcionando com a
   allowlist, desde que `x-forwarded-for` e `x-real-ip` estejam nela. **Confira isso antes de mergear**,
   senão você quebra a checagem de IP das linhas 84-96.
3. **Atalho a evitar:** filtrar na tela (`WebhookEventsPage`) em vez de na gravação. O dado já estaria no
   banco, legível por quem consultar a API direto — e a etapa 059 mostra que hoje qualquer usuário logado
   consulta. Filtre na origem.
4. Esta etapa **não** resolve o que já está gravado: isso é a etapa 058.

**Arquivos e objetos a tocar:** `supabase/functions/webhook-receiver/index.ts`.

**Não tocar / armadilhas:** não altere a ordem das verificações desta function — ela está correta
(`:167-182` rejeita quando o `auth_type` não casa, salvo `is_public`). Não mexa em `_shared/cors.ts` aqui
(é a etapa 091). **Armadilha:** o merge desta PR **publica a edge em produção automaticamente**
(`.github/workflows/edge-deploy.yml`), diferente do front-end.

**Depende de:** 007 · **Libera:** 058

**Risco e como reverter:** baixo. Perde-se detalhe de diagnóstico em webhooks futuros. Reverter:
`git revert` + `workflow_dispatch` do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** envie um webhook de teste com `Authorization: Bearer valor-de-teste` para um endpoint
de teste e consulte a linha gravada:
`SELECT headers FROM webhook_events ORDER BY created_at DESC LIMIT 1;` → o JSON **não** deve conter a chave
`authorization` com valor. Hoje contém.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 058 — Limpar os cabeçalhos com credencial já gravados em `webhook_events`

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (dado)
**Achados resolvidos:** INT-01

**Problema hoje:** o que a etapa 057 impede de entrar já está dentro. Quantas linhas e quais credenciais:
**NÃO VERIFICADO** — não houve acesso ao banco nesta sessão (`01-INVENTARIO.md` §6).

**Causa raiz:** a mesma da 057; esta etapa trata o passivo.

**Caminho recomendado:**

1. **Primeiro meça, depois apague.** Consulta de leitura:
   `SELECT count(*) FROM webhook_events WHERE headers ?| array['authorization','x-api-key','x-signature','x-hub-signature-256','x-twilio-signature'];`
2. Se o número for zero, **feche a etapa como "achado não se confirma no dado"** e registre a saída. O caminho
   de código continua corrigido pela 057 — isso é sucesso, não falha.
3. Se for maior que zero: apague **apenas as chaves sensíveis**, preservando o resto do diagnóstico, com um
   `UPDATE` que remove as chaves do JSONB (`headers - 'authorization' - 'x-api-key' - …`). **Não apague as
   linhas**: elas são a trilha de auditoria de webhook, e apagar dado é exatamente o que precisa de
   autorização explícita.
4. Trate as credenciais encontradas como **vazadas**: cada provedor externo cujo token apareceu precisa de
   rotação, e isso é uma etapa nova por provedor (registre no progresso).

**Arquivos e objetos a tocar:** uma migration nova em `supabase/migrations/` com o `UPDATE` de redação.

**Não tocar / armadilhas:** não faça `DELETE`. Não inclua o `UPDATE` na mesma PR da 057: se a 057 for
revertida, a limpeza deve permanecer. **Armadilha:** rodar o `UPDATE` **antes** da 057 estar em produção só
limpa o que já existe, e a próxima requisição regrava.

**Depende de:** 057 · **Libera:** —

**Risco e como reverter:** o `UPDATE` é irreversível sobre o conteúdo removido — e é esse o objetivo.
Faça a medição do passo 1 e guarde a contagem antes.

**Precisa de aprovação humana antes do merge:** **sim** — DDL/DML em banco de produção sobre dado existente.

**Como verificar:** repita a consulta do passo 1 → esperado **0**.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 059 — Trocar a policy `webhook_events_all` por isolamento de workspace

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (RLS)
**Achados resolvidos:** INT-01

**Problema hoje:** `supabase/migrations/20260405220001_automation_services.sql:118`:

```sql
CREATE POLICY "webhook_events_all" ON public.webhook_events FOR ALL USING (auth.uid() IS NOT NULL);
```

**`FOR ALL`** — SELECT, INSERT, UPDATE e DELETE — para **qualquer** usuário autenticado, de **qualquer**
workspace. EXECUTADO: só essa migration menciona a policy; nenhuma posterior a substitui ou remove.
É o que torna o INT-01 explorável: a tela `src/pages/WebhookEventsPage.tsx:69-73` faz
`.from("webhook_events" as never).select("*")` **sem filtro de workspace** e `:363` renderiza
`JSON.stringify(selectedEvent.headers)`.

**Causa raiz:** policy escrita como "basta estar logado" numa aplicação multi-inquilino. E este é o caso que
explica por que o `DB Drift Check` não acusa nada: ele valida que a RLS está **ligada**
(`RLS: 221/221`) e **não lê o conteúdo das policies**. RLS ligada com `USING (auth.uid() IS NOT NULL)` não
separa inquilino.

**Caminho recomendado:**

1. Migration nova, aditiva: `DROP POLICY IF EXISTS "webhook_events_all"` e criar policies **por operação**
   (SELECT, INSERT, UPDATE, DELETE separadas) restritas ao workspace do usuário.
2. Use o padrão que o próprio projeto já tem: a função `get_user_workspace_ids()` `SECURITY DEFINER`, citada
   em `docs/adr/005-rbac-client-side.md` como o jeito de evitar recursão de RLS. Referência de policy bem
   feita no repositório: as do bucket em
   `supabase/migrations/20261120150626_reconcile_knowledge_uploads_bucket.sql:38-51`, que separam por
   operação e restringem por identidade.
3. `webhook_events` precisa ter como chegar ao workspace. Se não houver coluna `workspace_id`, o caminho é por
   `webhook_id` → `webhook_endpoints.workspace_id`. **Confirme a coluna antes de escrever a policy** —
   `\d webhook_events` pelo caminho do `DB_MCP_URL`.
4. **Atalho a evitar:** corrigir só a consulta da tela (adicionar `.eq('workspace_id', …)`). A policy é a
   fronteira de segurança; a consulta é conveniência. Pelo ADR-005, "UI enforcement is UX only — not a
   security boundary". Corrija os dois, nesta ordem: policy primeiro.
5. Corrija a consulta da tela na mesma PR (`WebhookEventsPage.tsx:69-73`), inclusive removendo o `as never`.

**Arquivos e objetos a tocar:** migration nova em `supabase/migrations/`;
`src/pages/WebhookEventsPage.tsx`.

**Não tocar / armadilhas:** **a edge `webhook-receiver` escreve nessa tabela com `service_role`**, que ignora
RLS — então restringir a policy **não** quebra a gravação do webhook. Confirme isso antes de mergear, porque
o oposto (quebrar a ingestão de webhook) seria pior que o problema. Não altere a policy de
`webhook_endpoints` aqui: é a etapa 060.

**Depende de:** 053 · **Libera:** 060

**Risco e como reverter:** médio — se a expressão de workspace estiver errada, a tela fica vazia para todos.
Reverter: migration nova que restaure a policy anterior (não dependa de `git revert` para estado de banco).

**Precisa de aprovação humana antes do merge:** **sim** — DDL em banco de produção.

**Como verificar:** com dois usuários de workspaces diferentes (os secrets `E2E_EMAIL`/`E2E_PASSWORD`
existem no repositório): o usuário A consulta `webhook_events` e **não** vê nenhuma linha do workspace de B.
Consulta de apoio: `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid = 'public.webhook_events'::regclass;`
→ nenhuma policy com `polcmd = '*'` e expressão `auth.uid() IS NOT NULL`.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 060 — Trocar a policy `webhooks_all` e tirar o segredo do webhook de texto claro

**Onda / Severidade / Camada:** 1 / **Crítica** / Banco (RLS + dado sensível)
**Achados resolvidos:** INT-01

**Problema hoje:** `supabase/migrations/20260405220001_automation_services.sql:86`:
`CREATE POLICY "webhooks_all" ON public.webhook_endpoints FOR ALL USING (auth.uid() IS NOT NULL);`
e `:63` → `secret TEXT NOT NULL`. Ou seja: o **segredo HMAC** de cada webhook está em texto claro numa tabela
que qualquer usuário autenticado pode **ler e alterar**, de qualquer workspace.

**Causa raiz:** a mesma da 059, agravada por guardar segredo em coluna de texto comum em vez do cofre que o
projeto já tem (`workspace_secrets`, que a auditoria anterior verificou estar com RLS correta e policies
restritas ao dono do workspace).

**Caminho recomendado:**

1. Policies por operação restritas ao workspace, como na 059.
2. **Separe o segredo da configuração.** O caminho mais seguro é mover o valor para `workspace_secrets`
   (padrão já usado por `whatsapp-outbound`, que resolve segredo de provedor server-side) e deixar em
   `webhook_endpoints` apenas uma referência. Se isso for grande demais para uma etapa, o mínimo aceitável é:
   policies por operação **e** remover `secret` do `SELECT` da tela.
3. **Atalho a evitar:** "criptografar" a coluna com uma chave que fica no mesmo banco — não protege de quem já
   tem SELECT. O que protege é não devolver o valor para quem não é dono.
4. Trate os segredos atuais como **vazados**: qualquer usuário logado pôde lê-los. Depois de fechar a policy,
   **rotacione o segredo de cada webhook** e avise os provedores externos. Isso é uma etapa por provedor;
   registre no progresso.

**Arquivos e objetos a tocar:** migration nova em `supabase/migrations/`; o service/página que lê
`webhook_endpoints` (localize com `grep -rn "webhook_endpoints" src/`).

**Não tocar / armadilhas:** a validação HMAC do `webhook-receiver` lê `webhook.secret`
(`index.ts:99-120`) com `service_role` — restringir a policy não a quebra. **Confirme antes de mergear.**
Se você mover o segredo para `workspace_secrets`, a edge precisa passar a buscá-lo lá: isso é mudança de
comportamento da ingestão de webhook e merece PR própria.

**Depende de:** 059 · **Libera:** —

**Risco e como reverter:** alto se o passo 2 for feito junto — pode quebrar a validação de todos os webhooks.
Faça o passo 1 primeiro, verifique, e só então avalie o passo 2.

**Precisa de aprovação humana antes do merge:** **sim** — DDL em produção e rotação de segredo.

**Como verificar:** `SELECT polname, polcmd FROM pg_policy WHERE polrelid='public.webhook_endpoints'::regclass;`
→ nenhuma com `polcmd='*'`. E, com usuário do workspace A: `SELECT secret FROM webhook_endpoints` → nenhuma
linha de B.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 061 — Gerar segredo e path de webhook com gerador criptográfico

**Onda / Severidade / Camada:** 1 / **Alta** / Services / Segurança
**Achados resolvidos:** INT-02

**Problema hoje:** `src/services/webhookTriggerService.ts:49-57` (`generateWebhookSecret`) e `:39-47`
(`generateWebhookPath`) usam **`Math.random()`** — **no mesmo arquivo que usa `crypto.subtle` em `:62-77`**
para assinar. A assinatura é criptográfica e a chave que a sustenta é previsível. `Math.random()` no V8 é
xorshift128+, com estado recuperável a partir de algumas saídas.

**Causa raiz:** a mesma de **SEC-11** (códigos de 2FA): gerador de conveniência usado onde o requisito é
imprevisibilidade. Vale corrigir os dois com a mesma função utilitária.

**Caminho recomendado:**

1. Crie **um** utilitário de aleatoriedade segura (ex.: `src/lib/secureRandom.ts`) com
   `crypto.getRandomValues`, e use nos três pontos: `generateWebhookSecret`, `generateWebhookPath` e
   `src/hooks/use2FA.ts:48` (etapa 046). Se a etapa 046 já criou o utilitário, **reutilize** em vez de criar
   outro.
2. Gere bytes e codifique em hex ou base64url — **não** use `.toString(36).slice(...)`, que produz string de
   comprimento variável (o mesmo defeito do SEC-11).
3. **Atalho a evitar:** trocar só o `generateWebhookSecret` e deixar o path. O path é o que torna o endpoint
   descobrível; previsível, ele entrega a superfície mesmo com segredo forte.
4. Segredos já gerados com `Math.random()` precisam ser **rotacionados** (etapa 060, passo 4).

**Arquivos e objetos a tocar:** `src/services/webhookTriggerService.ts`; e `src/lib/secureRandom.ts` se o
utilitário ainda não existir.

**Não tocar / armadilhas:** não altere `:62-77` (a assinatura com `crypto.subtle` está correta). Atenção: se
o path mudar de formato, **webhooks já cadastrados continuam com o path antigo** — a mudança não pode
invalidar os existentes; aplique só na geração de novos.

**Depende de:** 046 · **Libera:** —

**Risco e como reverter:** baixo. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não**.

**Como verificar:** teste unitário novo: gerar 10.000 segredos e verificar (a) comprimento constante e
(b) nenhuma repetição. E `grep -n "Math.random" src/services/webhookTriggerService.ts` → **0 ocorrências**.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

### Etapa 062 — Fazer o guard de drift também reprovar policy que não separa inquilino

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura (CI) + Banco
**Achados resolvidos:** INT-01, DOC-01

**Problema hoje:** `scripts/db-drift-check.mjs` valida três invariantes (linhas 83-128): migrations
repo × banco, `RLS` ligada em 100 % das tabelas, e zero grant de escrita para `anon`. **As três passam no caso
do INT-01** — a RLS está ligada, e a escrita permitida é para `authenticated`, não para `anon`. Foi por isso
que uma exposição entre clientes conviveu com um check obrigatório verde e com o relatório
`RLS: 221/221 tabelas com RLS`.

**Causa raiz:** o guard mede a **presença** da RLS, não a **qualidade** da policy. É a mesma classe de erro de
SEC-02 (manifest × deploy), LINT-01 (`messages` × `suppressedMessages`) e SEC-HDR-01 (meta tag × cabeçalho em
vigor): verificar o indicador em vez do efeito.

**Caminho recomendado:**

1. Acrescente uma quarta invariante ao script: **nenhuma policy em `public` pode ter expressão que não
   referencie o inquilino**. A consulta de apoio:
   ```sql
   SELECT c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) AS expr
   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public';
   ```
   Reprove toda policy cuja `expr` seja equivalente a `auth.uid() IS NOT NULL` (ou `true`) **sem** nenhuma
   referência a `workspace_id`/`get_user_workspace_ids`/`user_id`.
2. **Comece com a lista de exceções explícita.** Rodar isso contra 221 tabelas provavelmente acusa várias
   policies de uma vez; se o check entrar reprovando tudo, ele será desligado na primeira PR. O caminho é:
   gerar o relatório, registrar a lista atual como baseline aceita (com justificativa por linha), e fazer o
   guard reprovar apenas **novas** entradas — o mesmo desenho que `scripts/ci/` já usa em
   `typecheck-baseline.json` e `eslint-baseline.json`.
3. **Atalho a evitar:** não transforme isso num check que só avisa (`::warning::`). O `db-drift-check` já tem
   um caminho de saída 0 com aviso (`:27-30`, achado CI-02) e é exatamente por isso que ninguém olha.
4. O baseline gerado neste passo é, por si só, o **inventário de policies permissivas** que esta auditoria não
   pôde produzir (sem acesso ao banco). Anexe-o ao progresso: ele define as etapas de RLS que faltam.

**Arquivos e objetos a tocar:** `scripts/db-drift-check.mjs`; um arquivo de baseline novo em `scripts/ci/`.

**Não tocar / armadilhas:** não mexa nas três invariantes existentes. **Armadilha:** o script roda com o MCP
do `DB_MCP_URL` e `read_only: true` (`:60-63`) — mantenha assim; o guard nunca deve escrever.

**Depende de:** 059, 060 · **Libera:** —

**Risco e como reverter:** baixo (código de CI), **se** o passo 2 for seguido. Sem baseline, o risco é travar
toda PR. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **sim** — altera um check obrigatório da `main`.

**Como verificar:** `DB_MCP_URL=<secret> node scripts/db-drift-check.mjs` → sai 0 e imprime a quarta linha de
relatório (contagem de policies permissivas). Teste negativo: acrescente uma policy permissiva ao baseline
esperado e confirme que o script sai **diferente de 0**.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

---

---

## Backlog — correções reais que não couberam nas 300 etapas

> Durante a auditoria, as últimas camadas de inventário (isolamento entre clientes, RBAC e
> variáveis de ambiente) revelaram achados **críticos** depois que a numeração já estava fechada.
> Eles tomaram o lugar de etapas de severidade menor, que ficam registradas aqui. São correções
> legítimas: execute-as depois das 300, ou troque a prioridade com o dono.

### (deslocada do nº 051) — Fazer o host de produção entregar os quatro cabeçalhos de segurança

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura
**Achados resolvidos:** SEC-HDR-01 (5 de 6)

**Problema hoje:** as etapas 047 a 050 tornam os cabeçalhos reais **apenas** no servidor do Vite, que atende
desenvolvimento e preview. **A produção continua sem nenhum deles**, e produção é onde o usuário está:
`https://superagent-lab.lovable.app` (responde 200, medido). Não há nada no repositório que configure o host:
não existe `vercel.json` nem `.vercel/` (medido com `ls`), e a conta da Vercel tem **0 projetos** no único
time (`juca1`) — `filter_project_envs fator-x-v2` devolve **404 Project not found**. O Lovable publica por
**botão manual** (`docs/RUNBOOK.md`) e sua configuração de cabeçalho **não está versionada aqui**.
Consequência medida e ainda aberta: qualquer site pode carregar `/auth` dentro de um iframe invisível e
sobrepor a tela de login.

**Causa raiz:** o host que está no ar não lê configuração do repositório, então nenhuma correção de código
alcança o cabeçalho de produção.

**Caminho recomendado:**

1. **Primeiro confirme o estado, com um comando, antes de mexer em qualquer painel:**
   `curl -sI https://superagent-lab.lovable.app/auth | grep -iE 'x-frame-options|content-security-policy|x-content-type-options|permissions-policy'`
   Esperado hoje: nenhuma linha. Anexe a saída — é o ponto de partida.
2. Procure, no painel do Lovable, a configuração de cabeçalhos/`headers` do projeto publicado e aplique os
   quatro valores exatamente como ficaram no `vite.config.ts` (etapas 047 e 050). **Copie da constante**, não
   redigite.
3. **Se o Lovable não oferecer configuração de cabeçalho** — é uma possibilidade real e não verificável desta
   sessão — então esta etapa **não tem solução dentro do Lovable**, e a correção passa a depender de trocar o
   host por um que leia configuração do repositório. Essa decisão é do dono, tem custo, e **já tem etapas
   próprias**: DEPLOY-01, etapas 063–068. Nesse caso: pare aqui, registre no progresso que o bloqueio é o
   host, e marque esta etapa como dependente das 063–068 em vez de improvisar.
4. **Atalho tentador a evitar:** publicar o front na Vercel só para ganhar os cabeçalhos, criando um segundo
   endereço de produção. Passaria a existir duas produções com versões diferentes do mesmo sistema — que é
   precisamente a classe de problema que o DEPLOY-01 descreve. Um host de produção, decidido de propósito.
5. **Segundo atalho a evitar:** pôr um Cloudflare/proxy na frente só para injetar cabeçalho. Resolve o
   sintoma e acrescenta uma peça de infraestrutura que ninguém neste projeto opera.

**Arquivos e objetos a tocar:** nenhum arquivo do repositório. Objeto: a configuração de cabeçalhos do
projeto publicado no Lovable (ou do host que vier da decisão das etapas 063–068).

**Não tocar / armadilhas:** não publique o front pelo botão do Lovable como parte desta etapa sem avisar o
dono — publicar leva **todas** as mudanças acumuladas desde 2026-11-11 para produção de uma vez (PRs #80 a
#145), o que é uma mudança grande demais para vir de carona numa etapa de cabeçalho. **Armadilha:** mesmo
depois de configurado o cabeçalho, se ninguém publicar o front, o HTML servido continua o antigo — mas o
cabeçalho é do servidor, não do HTML, então ele passa a valer imediatamente. Verifique com `curl`, não pela
aparência da página.

**Depende de:** 050 (e, se o Lovable não suportar, 063–068) · **Libera:** 052

**Risco e como reverter:** médio — um `X-Frame-Options`/`frame-ancestors` errado pode quebrar embutimentos
legítimos (o próprio preview do Lovable). Reverter: desfazer a configuração no painel.

**Precisa de aprovação humana antes do merge:** **sim** — é mudança de configuração de infraestrutura de
produção, feita no painel do host.

**Como verificar:** o mesmo `curl -sI` do passo 1, depois da mudança: as quatro linhas presentes, com os
valores esperados. Guarde as duas saídas (antes e depois) no progresso. Teste complementar de comportamento:
uma página HTML local com `<iframe src="https://superagent-lab.lovable.app/auth">` → o navegador tem de
recusar a renderização e dizer o motivo no console.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados (nesta etapa: nenhum)
- [ ] typecheck, lint e testes dos arquivos tocados passam (não se aplica)
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica (a configuração do host **É** a operação de produção)
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 052) — Tornar o teste de cabeçalhos um check obrigatório da `main`

**Onda / Severidade / Camada:** 1 / **Média** / Infraestrutura (CI)
**Achados resolvidos:** SEC-HDR-01 (6 de 6), CI-03 (parcial)

**Problema hoje:** depois da etapa 048 o teste passa a medir o que importa — mas **não barra nada**. Medido:
a proteção da `main` exige apenas `["Security Audit","Lint & Typecheck","Unit Tests","Build","DB Drift
Check"]`; o job `e2e-tests` tem `if: pull_request` e **não** é check obrigatório, assim como
`Edge Function Contract Tests`, `Lighthouse CI` e `Load Test` — os quatro apareceram `skipped` no run da
`main` do commit `d912348`. O workflow `guards.yml` inteiro também **não** é obrigatório. Ou seja: qualquer
PR que reintroduza o defeito passa.

**Causa raiz:** existem guards escritos e nenhum mecanismo que os ligue à decisão de merge — a mesma forma do
CQL-01 (830 execuções de CodeQL com `upload: never`) e do RLS-TEST-01 (8 testes de RLS que nunca rodam).

**Caminho recomendado:**

1. **Comece decidindo o conjunto, não o botão.** Acrescentar checks obrigatórios encarece todo merge futuro;
   escolha os que **barram defeito de segurança** e deixe de fora os caros e instáveis. Recomendação, com
   motivo: incluir `Guards` (barato, determinístico, já cobre manifest e segredos no bundle) e `E2E Tests`
   (é onde vive o teste de cabeçalho); **não** incluir `Lighthouse CI` nem `Load Test (k6)` — são lentos,
   dependem de serviço externo e vão transformar CI vermelha em rotina ignorada.
2. **Antes de tornar `E2E Tests` obrigatório, feche o E2E-01** (etapas 084–087): hoje a suíte falha no runner
   por falta de ffmpeg — medido, 26 de 26 falharam por isso e 31 passaram depois de
   `npx playwright install ffmpeg`. Tornar obrigatório um job que falha por motivo de ambiente trava todo
   merge do repositório no dia seguinte. **Esta é a dependência que mais importa nesta etapa.**
3. Os dois jobs rodam hoje só em `pull_request`. Para serem checks obrigatórios eles precisam aparecer também
   nos pushes relevantes, ou a proteção passa a esperar por um check que nunca chega. Ajuste os gatilhos no
   `ci.yml`/`guards.yml` **antes** de mexer na branch protection.
4. Aplique com `github_update_required_status_checks` em `adm01-debug/Fator_X_V2`, `main`, preservando os 5
   checks atuais e mantendo `strict: false` (o `AGENTS.md` explica por quê: PR atrasada não é barrada).
5. **Atalho tentador a evitar:** marcar tudo o que existe como obrigatório de uma vez. O resultado previsível
   é CI vermelha permanente e a primeira reação será desligar a proteção — ficando pior do que antes.

**Arquivos e objetos a tocar:** `.github/workflows/ci.yml` e/ou `.github/workflows/guards.yml` (gatilhos);
configuração de branch protection da `main` (objeto do GitHub, não arquivo).

**Não tocar / armadilhas:** não mexa em `enforce_admins`, `required_linear_history` nem `allow_force_pushes`
— estão corretos. Não acrescente `required_pull_request_reviews` nesta etapa; é a etapa 059, e tem decisão do
dono. **Armadilha:** com `enforce_admins: true` ligado, um check obrigatório quebrado bloqueia **inclusive o
dono** — não há escape manual. Tenha o procedimento de remover o check anotado antes de ligá-lo.

**Depende de:** 048, 084–087 · **Libera:** —

**Risco e como reverter:** médio-alto para a velocidade do time: um check obrigatório instável trava todos os
merges. Reverter: remover o check da lista pela API ou pelo painel (efeito imediato).

**Precisa de aprovação humana antes do merge:** **sim** — toca `.github/workflows/` e a proteção da branch.

**Como verificar:** `github_get_branch_protection owner=adm01-debug repo=Fator_X_V2 branch=main` →
`required_status_checks.contexts` contém os novos nomes. Prova de que funciona: abra uma PR de teste que
reintroduza uma das metas inertes no `index.html` **e** remova o bloco `headers` do `vite.config.ts` → o
merge tem de ficar **bloqueado**. Feche a PR sem mergear e registre a captura do estado bloqueado.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 055) — Ligar o gate novo no `Security Audit` do CI

**Onda / Severidade / Camada:** 1 / **Alta** / Infraestrutura (CI)
**Achados resolvidos:** CI-01 (2 de 4)

**Problema hoje:** enquanto `.github/workflows/ci.yml:30` continuar sendo
`npm audit --audit-level=critical --omit=dev`, o script da etapa 054 existe e não decide nada. E
`Security Audit` **é** um dos 5 checks obrigatórios da `main` — é o lugar de maior alavancagem do CI inteiro.

**Causa raiz:** a mesma do CI-01: o gate obrigatório mede com um limiar que foi escolhido para acomodar uma
exceção específica.

**Caminho recomendado:**

1. Troque o passo da linha 30 por `node scripts/ci/audit-gate.mjs`, mantendo `continue-on-error: false`
   (linha 31) e o `npm ci` anterior (linha 25) — o script precisa do `node_modules` para o `npm audit`.
2. **Mantenha o comentário das linhas 26-29 ou mova-o para o `audit-baseline.json`.** Ele é o registro de
   _por que_ o `react-router` é exceção; jogá-lo fora é destruir a única justificativa escrita que existe, e
   o próximo agente vai "consertar" a exceção sem saber o motivo.
3. Faça esta etapa **depois** da 054 e com a 056 já decidida ou em andamento: no instante em que este passo
   entrar, a `main` fica **vermelha** por causa do `zod` — e isso é o comportamento correto, mas trava os
   merges de todo mundo até a 056 fechar. Ou mergeie as duas na mesma janela, ou combine com o dono.
4. **Atalho tentador a evitar:** ligar o script com `continue-on-error: true` "para não travar ninguém".
   Isso cria mais um controle que roda e não barra — exatamente o CQL-01 (830 execuções de CodeQL com
   `upload: never`) e o CI-02. Se não puder barrar agora, **não ligue ainda**: espere a 056.

**Arquivos e objetos a tocar:** `.github/workflows/ci.yml` (job `security-audit`, passos das linhas 25-31).

**Não tocar / armadilhas:** não mexa nos outros jobs do `ci.yml` nesta etapa. Não mude o nome do check
(`Security Audit`, `ci.yml:16`) — ele está na lista de checks obrigatórios da proteção da `main` por esse
nome exato, e renomear **remove silenciosamente** a exigência. **Armadilha:** `enforce_admins: true` está
ligado; com o check vermelho **ninguém**, nem o dono, mergeia. Tenha a 056 pronta.

**Depende de:** 054 · **Libera:** —

**Risco e como reverter:** alto para a velocidade: trava todo merge enquanto houver vulnerabilidade alta de
runtime fora do baseline. Reverter: `git revert` (o check volta ao comando antigo no próximo run).

**Precisa de aprovação humana antes do merge:** **sim** — toca `.github/workflows/`.

**Como verificar:** no run do `Nexus CI` da própria PR, o job `Security Audit` mostra a saída do
`audit-gate.mjs`. Antes da 056: **falha** citando o `zod` (prova de que o gate agora barra). Depois da 056:
**sucesso**. Anexe os dois links de job ao progresso.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 056) — Fechar a vulnerabilidade alta de runtime do `zod` no front-end

**Onda / Severidade / Camada:** 1 / **Alta** / Dependências
**Achados resolvidos:** CI-01 (3 de 4)

**Problema hoje:** `package.json:144` declara `"zod": "^3.25.76"` em **`dependencies`** (runtime, vai para o
navegador), e a versão instalada é `3.25.76`. Medido nesta sessão com `npm audit --omit=dev`:

```
zod  <4.6.6
Severity: high
Zod can exhaust memory while validating oversized constrained collections — GHSA-mrhx-c7xc-m3w5
fix available via `npm audit fix --force`
Will install zod@4.6.7, which is a breaking change
```

É a **única** vulnerabilidade alta de runtime do projeto, e é a que passa pelo gate atual. O alerta
correspondente está entre os 19 abertos do Dependabot — e `dependabot_security_updates` está **desabilitado**
no repositório, então nenhum PR automático chega.

**Causa raiz:** a correção publicada pelo mantenedor só existe numa versão **major** acima da usada, e o
projeto não tem um procedimento para bump major.

**Caminho recomendado:**

1. **Avalie o impacto real antes de decidir**, porque a vulnerabilidade é exaustão de memória ao validar
   coleções restringidas de tamanho desproporcional: liste onde o `zod` valida entrada **vinda de fora**.
   Medido: 11 arquivos de `src/` importam `zod`, e a maioria é `src/lib/validations/*` (formulário do próprio
   usuário logado) — superfície baixa. O vetor sério é o que valida payload de terceiro. Escreva essa lista
   no corpo da PR: ela é o que justifica a urgência (ou a ausência dela) para o dono.
2. **Há um caminho de bump major com risco baixo, e ele existe por desenho do próprio `zod`:** a versão
   instalada (`3.25.76`) já traz os dois runtimes dentro do pacote — `ls node_modules/zod/` mostra `v3/`,
   `v4/` e `v4-mini/`. Confirme, no pacote `4.6.7`, se o subpath `zod/v3` continua publicado; se sim, o bump
   pode ser feito **sem reescrever os 11 arquivos**: sobe a versão e, nos pontos que quebrarem, troca
   `from 'zod'` por `from 'zod/v3'`, migrando depois, arquivo por arquivo, fora da Onda 1. Verifique isso
   lendo o `exports` do `package.json` do pacote novo — **não presuma**.
3. **Fale com o dono antes de tocar nos arquivos.** O `AGENTS.md` é explícito: há **fila permanente do
   Dependabot** em `package.json`/`package-lock.json` e esses dois arquivos não se tocam sem combinar; e
   bump major só se indispensável, avisando na PR. Hoje há **0 PRs abertas** (medido), então a janela está
   livre — confirme com `github_list_pull_requests` antes de começar, porque isso muda.
4. **Atalho tentador a evitar:** `npm audit fix --force`. Ele resolve o `zod` e, no mesmo comando, mexe no
   que mais quiser — inclusive nas dependências de dev com advisory (`vitest`, `vite`, `tinypool`), gerando
   um diff de lockfile impossível de revisar e podendo trocar a versão do Vite por baixo do build. Faça o
   bump **nominal**: `npm install zod@4.6.7` (uma dependência, um diff).
5. **Segundo atalho a evitar:** pôr o `zod` no baseline de exceções da etapa 054. É uma alta **de runtime**
   com correção disponível; aceitar exceção aqui esvazia o gate recém-criado no primeiro uso.
6. Se o dono decidir **não** subir agora, a decisão tem de ficar escrita: entrada no
   `scripts/ci/audit-baseline.json` com `motivo` e `revisar_em` a, no máximo, 30 dias — o mecanismo da etapa
   054 existe justamente para que "depois" tenha data.

**Arquivos e objetos a tocar:** `package.json`, `package-lock.json` e, se a migração exigir, os 11 arquivos
que importam `zod` (`src/lib/validations/*.ts`, `src/lib/skillComposer/skillDraft.ts`,
`src/services/secretsRotationService.ts`, `src/components/agents/wizard/QuickCreateWizard.tsx`).

**Não tocar / armadilhas:** **não** altere no mesmo PR o `esm.sh/zod@3.23.8` das edge functions — são 47
arquivos e é a etapa 057. **Armadilha de orçamento de bundle:** `node scripts/check-bundle-size.mjs` está em
**96 %** (2.501,2 de 2.600 KB, medido); se o `zod` 4 for maior, o gate `Build` estoura e a culpa vai parecer
ser de outra coisa. Rode o check de bundle **antes** de abrir a PR. Segunda armadilha:
`@hookform/resolvers@^3.10.0` (`package.json:57`) costuma casar com uma major específica do `zod` — confirme
a compatibilidade antes, embora não haja nenhum uso de `zodResolver` hoje (medido: 0 ocorrências em `src/`),
o que reduz bastante o risco.

**Depende de:** 054 · **Libera:** 055 (sem esta etapa, o gate da 055 deixa a `main` vermelha)

**Risco e como reverter:** médio-alto — é mudança de major numa dependência de validação usada em 11 pontos.
Reverter: `git revert` da PR (volta `package.json` e o lockfile juntos).

**Precisa de aprovação humana antes do merge:** **sim** — `package.json`/`package-lock.json` com fila do
Dependabot, e bump de major (decisão de risco e de custo de manutenção).

**Como verificar:** `npm ci && npm audit --omit=dev` → **zero** vulnerabilidades altas ou críticas; e
`node scripts/ci/audit-gate.mjs` sai 0. Depois: `npx tsc --noEmit` (exit 0), `npx vitest run` (os 6.226
testes continuam passando — este é o teste de regressão que importa para um bump de `zod`) e
`node scripts/check-bundle-size.mjs` ainda dentro do orçamento. Registre as quatro saídas.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 057) — Corrigir a mesma vulnerabilidade do `zod` nas 47 edge functions, que o `npm audit` não vê

**Onda / Severidade / Camada:** 1 / **Alta** / Backend (edge) / Dependências
**Achados resolvidos:** CI-01 (4 de 4)

**Problema hoje:** as edge functions não usam o `node_modules`: importam por URL. Medido nesta sessão —
`grep -rho "esm.sh/zod@[0-9.]*" supabase/functions/` devolve **47 ocorrências de `esm.sh/zod@3.23.8`**, em
**47 arquivos** (por exemplo `supabase/functions/a2a-server/index.ts:20` e
`supabase/functions/cron-executor/index.ts:5`). `3.23.8` está dentro da faixa afetada por
GHSA-mrhx-c7xc-m3w5 (`<4.6.6`), **e o `npm audit` não enxerga nada disso** — ele lê o lockfile, e a URL do
esm.sh não está em lockfile nenhum. Resultado: a etapa 056 pode fechar o alerta do Dependabot e deixar a
vulnerabilidade **inteira** de pé no lado que de fato recebe tráfego de terceiros, que é o das edges.
Agravante de exposição: é nas edges que o `zod` valida payload **de fora** — `A2ATaskSchema`
(`a2a-server/index.ts:22-32`) aceita array de até 50 partes com texto de até 50.000 caracteres, exatamente a
forma de "coleção restringida grande" descrita no advisory.

**Causa raiz:** duas árvores de dependência (npm para o front, URL fixa para as edges) e **um** mecanismo de
auditoria, que só cobre a primeira.

**Caminho recomendado:**

1. Trate como mudança mecânica e verificável: suba o pin de `3.23.8` para uma versão `>= 4.6.6` **ou** para o
   `3.25.x` mais recente **se** o esm.sh publicar a correção na linha 3 — confira o advisory antes; se a
   correção só existe na 4.x, o pin tem de ir para a 4.x e os schemas precisam ser revisados.
2. **Não troque os 47 de uma vez.** Comece por **uma** function com schema simples e sem `tools`
   (por exemplo `cron-executor`, que usa `z.object({}).passthrough().optional()`), deploye, confirme o
   comportamento, e só então faça o resto. O deploy aqui é automático no merge
   (`.github/workflows/edge-deploy.yml` publica em todo push na `main` que toque `supabase/functions/**`), e
   um erro de import derruba **as 89 ao mesmo tempo** na próxima publicação.
3. Ponha a URL em um lugar só. O repositório já tem o barril `supabase/functions/_shared/mod.ts` para
   centralizar dependência compartilhada — reexportar o `zod` por lá (`export { z } from "https://esm.sh/zod@<v>"`)
   transforma o próximo bump de 47 edições em uma. Faça isso **na mesma PR**, senão o problema volta.
4. Crie o guard, no padrão dos vizinhos de `scripts/ci/`: um script que varra `supabase/functions/` e falhe
   se existir mais de uma versão de `zod` pinada, ou alguma abaixo do mínimo. Referência de forma:
   `scripts/ci/check-supabase-url-import-meta.mjs` (varre `src/` e falha por padrão proibido) com seu
   `*.unit.mjs` — o `guards.yml:63` já roda os testes unitários de `scripts/ci/*`.
5. **Atalho tentador a evitar:** deixar como está porque "o `npm audit` está verde". Essa é literalmente a
   causa raiz A desta auditoria — o indicador declarado não cobre o que está em execução. Se você não for
   corrigir agora, registre no `audit-baseline.json` da etapa 054 com data de revisão, para que fique
   visível.
6. **Segundo atalho a evitar:** trocar `esm.sh` por `deno.land/x` ou `npm:` no mesmo PR. É mudança de
   mecanismo de resolução de módulo em 47 arquivos, com efeito no tempo de cold start; faça o bump primeiro.

**Arquivos e objetos a tocar:** os 47 arquivos sob `supabase/functions/` que importam
`https://esm.sh/zod@3.23.8` (liste com `grep -rl "esm.sh/zod" supabase/functions/`);
`supabase/functions/_shared/mod.ts`; um guard novo em `scripts/ci/`.

**Não tocar / armadilhas:** não altere o conteúdo dos schemas nesta etapa — só a origem do import.
**Armadilha:** se o pin for para a 4.x, a API muda (`z.record`, mensagens de erro, `.flatten()`), e
**`error.flatten().fieldErrors` é usado em resposta de erro de várias functions** (por exemplo
`cron-executor/index.ts:23` e `a2a-server/index.ts:227`). Se o formato mudar, a mensagem de erro que o front
exibe muda junto — teste com um payload inválido antes de mergear. Segunda armadilha: `supabase/functions/`
**não é analisado** pelo gate de lint do CI, que só olha `src/` (achado LINT-01) — não conte com o CI para
pegar um erro de tipo aqui; rode `npx eslint supabase/functions/<arquivo>` à mão.

**Depende de:** 007 · **Libera:** —

**Risco e como reverter:** **alto** — toca 47 arquivos de edge function, e o merge publica. Mitigação: a
abordagem em duas PRs do passo 2 (uma function, depois o resto). Reverter: `git revert` + `workflow_dispatch`
do `Edge Deploy`.

**Precisa de aprovação humana antes do merge:** **não** pela regra de escopo (é código de edge function, sem
DDL, sem segredo, sem workflow) — **mas avise o dono na PR**: 47 arquivos e publicação automática de 89
functions justificam um aviso explícito.

**Como verificar:**

```
grep -rho "esm.sh/zod@[0-9.]*" supabase/functions/ | sort | uniq -c
```

Esperado: **uma única** versão, `>= 4.6.6` (ou a corrigida da linha 3), em 47 ocorrências — ou zero
ocorrências diretas, se tudo passar pelo `_shared/mod.ts`. Depois do deploy, prove que a validação continua
funcionando: `curl` com payload inválido em uma function tocada → **400** com `details`, e não 500. Registre
a saída do `grep` e o corpo da resposta 400.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 058) — `db-drift-check`: falhar quando não consegue verificar, em vez de sair 0

**Onda / Severidade / Camada:** 1 / **Média** / Infraestrutura (CI)
**Achados resolvidos:** CI-02

**Problema hoje:** `scripts/db-drift-check.mjs:27-30`:

```js
if (!MCP_URL) {
  console.log('::warning::DB_MCP_URL não configurado — db-drift-check pulado (opt-in).');
  process.exit(0);
}
```

`DB Drift Check` é um dos **5 checks obrigatórios** da `main`. Hoje o secret `DB_MCP_URL` existe no
repositório (está entre os 15 nomes medidos) e o guard roda de verdade — foi ele que produziu
`repo=338 banco=338`, `RLS: 221/221`, zero escrita `anon` em 2026-11-21. Mas **qualquer ambiente sem o
secret tem um check obrigatório que passa sem verificar nada**: um fork, uma reconfiguração, um secret
expirado ou renomeado, e o CI continua verde afirmando algo que não mediu. Localmente, reproduzido:
`node scripts/db-drift-check.mjs` sem a variável → exit 0 com o `::warning::`.

**Causa raiz:** "não consegui medir" e "medi e está tudo bem" compartilham o mesmo código de saída. É a mesma
forma do RLS-TEST-01 (8 testes de RLS que saem 0 ao serem pulados) e do CQL-01 — **o silêncio é
indistinguível do sucesso**.

**Caminho recomendado:**

1. Distinga ambiente. Em CI (`process.env.GITHUB_ACTIONS === 'true'`), **falte o secret → exit 1** com
   `::error::`. Localmente, mantenha o `exit 0` com aviso: o executor precisa poder rodar o script sem
   credencial de produção, e o `AGENTS.md` o lista como comando de uso normal.
2. Ofereça a saída explícita para o caso legítimo de pular: uma flag `--allow-skip` (ou
   `DB_DRIFT_ALLOW_SKIP=1`). **Não** silencie por padrão em CI — a exceção tem de ser escrita por quem a
   quer, no lugar onde se vê.
3. Diferencie também os outros dois modos de falha, que hoje se confundem: "secret ausente" é problema de
   configuração; "MCP respondeu erro HTTP" (`:49`) é problema de conectividade; "invariante quebrada" é
   problema real do banco. Mensagens e códigos distintos — senão a próxima falha vai ser lida como a
   anterior.
4. **Atalho tentador a evitar:** tirar o `DB Drift Check` da lista de checks obrigatórios porque "pode falhar
   por falta de secret". Seria desligar a única verificação automática que existe hoje contra o drift de
   banco — o problema que originou o próprio script (ver o cabeçalho dele, `:6-9`).
5. **Segundo atalho a evitar:** fazer o script tentar conectar com uma URL padrão embutida. Isso põe
   credencial de produção em código. `AGENTS.md` → segredos nunca em código.

**Arquivos e objetos a tocar:** `scripts/db-drift-check.mjs` (bloco `:24-30` e as mensagens de erro).

**Não tocar / armadilhas:** não toque nas três consultas de invariante nem no cliente MCP (`:32-57`) — eles
funcionam e produziram a medição de 2026-11-21. Não altere `.github/workflows/ci.yml` nesta etapa: o passo
já chama o script e já injeta o secret (`ci.yml:42-47`); a mudança de comportamento é toda no script.
**Armadilha:** no instante em que isto entrar, se o `DB_MCP_URL` estiver quebrado ou expirado, **a `main`
fica intransitável** — e com `enforce_admins: true` nem o dono mergeia. Rode o workflow manualmente
(`workflow_dispatch` do `Nexus CI`) **antes** de mergear, para confirmar que o secret está vivo.

**Depende de:** — · **Libera:** —

**Risco e como reverter:** médio na velocidade de merge, nulo em produção. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **sim** — altera o comportamento de um check obrigatório da
`main` (decisão de infraestrutura), ainda que o arquivo tocado seja um script.

**Como verificar:** três execuções, com as saídas registradas:

1. `node scripts/db-drift-check.mjs` (local, sem variável) → exit **0** com aviso (continua assim);
2. `GITHUB_ACTIONS=true node scripts/db-drift-check.mjs` (sem `DB_MCP_URL`) → exit **1** com `::error::`;
3. `workflow_dispatch` do `Nexus CI` na branch da PR → job `DB Drift Check` **verde**, com as três
   invariantes impressas (é a prova de que o secret está vivo e o caminho real não regrediu).

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 059) — Decidir e registrar a política de revisão da `main`, e consertar o CODEOWNERS inerte

**Onda / Severidade / Camada:** 1 / **Média** / Infraestrutura (GitHub)
**Achados resolvidos:** CI-03

**Problema hoje:** a proteção da `main` (medido com `github_get_branch_protection`) **não tem**
`required_pull_request_reviews` — o campo está **ausente**, o que significa **zero aprovação necessária** para
mergear. Também `required_conversation_resolution: false`: um comentário de revisão aberto não impede o merge.
E o `.github/CODEOWNERS` referencia times que não existem: **22 entradas `@nexus/…`** medidas agora
(`grep -c "@nexus/" .github/CODEOWNERS`; o `AGENTS.md` fala em 27), começando pelo fallback global
`* @nexus/core` (`:6`). Nenhum desses times existe, então nenhum revisor é solicitado — o arquivo tem o nome
de "revisão obrigatória por domínio" no cabeçalho e não produz revisão nenhuma.

**Causa raiz:** a regra de revisão foi escrita em um arquivo (CODEOWNERS) que depende de times inexistentes,
e a proteção da branch nunca foi configurada para exigi-la. Mais uma vez: **a intenção está declarada em um
lugar que não tem efeito.**

**Caminho recomendado:**

1. **Não ligue `required_pull_request_reviews` por reflexo.** Pense em quem clicaria em "Approve": o
   `AGENTS.md` diz, na primeira linha, que **o dono não é dev e não revisa diff**, e autoriza o agente a
   mergear sem aprovação PR sua, pronta, de escopo comum. Exigir 1 aprovação, com um único humano não-dev na
   conta, significaria ou travar todo o trabalho ou treinar o dono a aprovar sem ler — que é pior do que não
   exigir, porque cria um registro falso de revisão.
2. O caminho coerente com este projeto é **compensar com verificação automática, não com ritual humano**, e
   deixar isso **escrito**:
   - ligue `required_conversation_resolution: true` (barato e real: impede mergear com comentário pendente —
     inclusive os de outro agente);
   - amplie o conjunto de checks obrigatórios (etapa 052);
   - e **registre no `AGENTS.md`**, na seção "Fluxo Git", que zero aprovação é **decisão deliberada** e qual
     é a compensação. Hoje o `AGENTS.md` diz "Mergeie sem aprovação" sem dizer que a plataforma também não
     exige — então um agente futuro pode "consertar" isso achando que é descuido.
3. Conserte o CODEOWNERS escolhendo **um** dos dois caminhos, e só um:
   - (a) trocar as 22 entradas `@nexus/*` por `@adm01-debug` (a conta que existe), aceitando que isso faz o
     GitHub solicitar revisão do dono em toda PR — ruído, mas visibilidade; ou
   - (b) **reduzir o arquivo ao que é verdade**: deixar só os caminhos realmente sensíveis
     (`/.github/workflows/`, `/supabase/migrations/`, segredos) apontando para `@adm01-debug`, e remover o
     resto. Prefira (b): um CODEOWNERS curto e verdadeiro vale mais que 22 linhas decorativas, e os caminhos
     que sobram são justamente os que o `AGENTS.md` já manda levar ao dono.
     Confirme o estado antes com `github_get_codeowners_errors` — **não verificado nesta auditoria**, e é a
     ferramenta que lista exatamente quais entradas o GitHub considera inválidas.
4. **Atalho tentador a evitar:** apagar o `.github/CODEOWNERS` inteiro. Sem ele, não existe nem o registro de
   quais caminhos são sensíveis, e a informação some do repositório.

**Arquivos e objetos a tocar:** `.github/CODEOWNERS`; `AGENTS.md` (seção "Fluxo Git", uma frase); proteção da
branch `main` (objeto do GitHub).

**Não tocar / armadilhas:** não mexa em `required_linear_history`, `allow_force_pushes`, `allow_deletions`
nem `enforce_admins` — estão corretos e são o que impede reescrita de histórico. **Armadilha:** o
`check-agents-md-integrity.mjs` vigia o `AGENTS.md`: ele exige os 8 cabeçalhos de seção
(`REQUIRED_SECTIONS`, `:20-29`) e falha se o conjunto encolher mais de 30 %, ou se um arquivo vigiado cair
abaixo de 50 % do tamanho de base (`:30-31`). **Acrescentar** uma frase é seguro; cortar seção, não.
Segunda armadilha: `required_conversation_resolution: true` vale também para comentário de bot — se algum bot
comentar em toda PR, o merge passa a depender de alguém resolver a conversa.

**Depende de:** — · **Libera:** —

**Risco e como reverter:** baixo tecnicamente, mas afeta o fluxo de trabalho de todos os agentes. Reverter:
desfazer no painel/API (efeito imediato) e `git revert` dos dois arquivos.

**Precisa de aprovação humana antes do merge:** **sim** — altera proteção de branch e CODEOWNERS, e o
`AGENTS.md` lista os dois explicitamente como "deixe aberta e chame o dono".

**Como verificar:** `github_get_branch_protection owner=adm01-debug repo=Fator_X_V2 branch=main` →
`required_conversation_resolution.enabled: true` e `required_pull_request_reviews` com o valor que o dono
escolheu (registre qual foi, e o motivo). E `github_get_codeowners_errors owner=adm01-debug
repo=Fator_X_V2` → **lista vazia** (hoje, não verificado; esperado: 22 erros de time inexistente). Cole as
duas saídas no progresso.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 060) — `AGENTS.md`: corrigir "repositório privado" para o que foi medido (público)

**Onda / Severidade / Camada:** 1 / **Alta** / Documentação
**Achados resolvidos:** DOC-01 (1 de 3)

**Problema hoje:** `AGENTS.md:54` afirma: _"Repo `adm01-debug/Fator_X_V2`, `main`, **privado**."_
Medido com `github_get_repo`: `"private": false`, `"visibility": "public"`, `allow_forking: true`,
`secret_scanning: disabled`, `secret_scanning_push_protection: disabled`. O repositório é **público desde
2026-05-11** (`created_at`). Como todo agente começa a sessão lendo este arquivo (via `CLAUDE.md`, que é só
`@AGENTS.md`), **a premissa errada se propaga a cada sessão** — e foi ela que transformou a chave hardcoded
do SEC-01 de "problema interno" em "credencial de produção publicada na internet". Esta linha é o erro de
documentação de maior alcance do repositório.

**Causa raiz:** uma afirmação sobre o ambiente foi escrita por inferência e nunca conferida contra a
plataforma, em um arquivo que é a fonte normativa de todos os agentes.

**Caminho recomendado:**

1. Faça **depois da etapa 004**, onde o dono decide se o repositório continua público ou vira privado. Se
   você escrever agora e a decisão for outra, a linha fica errada de novo — e a mesma frase errada volta a
   valer como norma.
2. Escreva a visibilidade **com a consequência operacional ao lado**, não só o adjetivo. O valor de "privado"
   nessa frase era implícito: "pode-se ser menos rígido com o que entra no commit". Em repositório público,
   a regra que importa é a oposta, e ela já existe no mesmo arquivo (seção Postura: segredos nunca em código,
   commit ou resposta). Uma frase do tipo _"público: qualquer coisa commitada é pública para sempre —
   rotação é a única correção para segredo exposto"_ carrega a informação **e** o comportamento.
3. Aproveite para registrar, na mesma linha ou vizinha, dois fatos medidos que hoje faltam e que mudam o
   trabalho do agente: `delete_branch_on_merge: false` (o `AGENTS.md` manda apagar a branch — é **manual**) e
   o estado do secret scanning depois da etapa 004.
4. **Atalho tentador a evitar:** reescrever a seção "Fluxo Git" inteira "de uma vez, já que estou aqui". O
   `AGENTS.md` é o arquivo mais lido do projeto e o que mais custa revisar; diff mínimo, uma afirmação por
   vez (`AGENTS.md` → "Diff mínimo, zero churn").
5. **Segundo atalho a evitar:** marcar a correção como feita sem rodar o guard de integridade. Ele falha por
   encolhimento, e uma reescrita que "enxuga" o texto pode reprovar o CI por um motivo que parece não ter
   relação nenhuma com o seu diff.

**Arquivos e objetos a tocar:** `AGENTS.md` (linha 54 e, no máximo, as vizinhas da mesma seção).

**Não tocar / armadilhas:** não mexa nos 8 cabeçalhos de seção (`## Postura`, `## Bugs e funcionalidades`,
`## Comunicação`, `## Fluxo Git`, `## Banco`, `## Serviços`, `## Stack e comandos`, `## Grafo de código`) —
`scripts/check-agents-md-integrity.mjs:20-29` os exige por texto exato e **o CI falha** se um deles sumir ou
mudar. Não reduza o arquivo: o mesmo script reprova encolhimento acima de 30 % no conjunto e de 50 % por
arquivo (`:30-31`).

**Depende de:** 004 · **Libera:** —

**Risco e como reverter:** nenhum risco técnico; o risco é documentar errado. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não** (documentação). Mas a **decisão** de visibilidade que
esta linha registra é do dono, e vem da etapa 004.

**Como verificar:** `node scripts/check-agents-md-integrity.mjs` → exit 0 (hoje: 8 seções, 49.604 bytes).
E conferência cruzada: `github_get_repo owner=adm01-debug repo=Fator_X_V2` → o valor de `private` tem de ser
**o mesmo** que a linha nova afirma. Cole as duas evidências lado a lado no progresso — é o par
documento × medição que faltava.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 061) — `docs/agentes/deploy.md`: corrigir o caminho de deploy do front para o que existe

**Onda / Severidade / Camada:** 1 / **Alta** / Documentação
**Achados resolvidos:** DOC-01 (2 de 3)

**Problema hoje:** `docs/agentes/deploy.md:6-8` declara: _"Decisão do dono (2026-11-08): a Vercel é o caminho
oficial de deploy do front. O Lovable continua documentado no RUNBOOK como alternativa histórica"_, e `:14`
descreve o _"projeto `fator-x-v2`, time `juca1`"_ com último deploy de produção em 2026-09-05. Medido nesta
auditoria pelo MCP da Vercel: o time `juca1` (único da conta) tem **0 projetos e 0 deployments**, e
`filter_project_envs fator-x-v2` devolve **404 Project not found**. Não existe `vercel.json` nem `.vercel/`
no repositório. **A produção que está no ar é o Lovable** — `https://superagent-lab.lovable.app` responde
**200** e renderiza o login. Além disso, o `homepage` do repositório ainda aponta para
`https://fator-x-v2.vercel.app`, que não tem projeto atrás.
Consequência: o agente que ler este arquivo vai "confirmar o deploy" num lugar onde não há nada, e vai
concluir que o merge publicou o front — quando **nada publica o front automaticamente** (achado DEPLOY-01).

**Causa raiz:** o documento registra uma decisão de 2026-11-08 que não se concretizou (o projeto da Vercel
deixou de existir), e nada reconciliou o texto com a plataforma.

**Caminho recomendado:**

1. **Corrija o estado, não a decisão.** O arquivo tem duas camadas: "o dono decidiu usar a Vercel" (que é
   história, e vale registrar) e "o deploy acontece na Vercel" (que é falso hoje). Mantenha a primeira como
   decisão **pendente de execução** e corrija a segunda com o medido: produção = Lovable, publicação por
   botão manual (`docs/RUNBOOK.md`), zero projeto na Vercel.
2. **Escreva, em destaque, a assimetria** — é a informação operacional mais valiosa deste arquivo e não está
   em lugar nenhum do repositório: **merge na `main` publica edge function automaticamente**
   (`.github/workflows/edge-deploy.yml`, gatilho em `supabase/functions/**`), e **merge na `main` NÃO publica
   o front-end**. As duas convivem no mesmo PR e no mesmo fluxo. Todo agente que disser "está em produção"
   depois de mergear front estará errado.
3. Registre também o que está medido sobre a defasagem, porque é o que dá urgência: o HTML em produção é
   **anterior a 2026-11-11** (a correção de `index.html:17` entrou pela PR #80, mergeada em
   2026-11-11T23:30:39Z, e produção ainda serve o ID antigo `tdprnylgyrogbbhgdoik`), ou seja, as PRs #80 a
   #145 **não chegaram ao usuário**.
4. Não resolva o deploy aqui. A reativação da Vercel (ou a escolha definitiva do host) é o achado DEPLOY-01,
   **etapas 063–068**, e envolve custo e decisão do dono. Esta etapa só impede que o próximo agente afirme
   algo falso. Aponte o leitor para aquelas etapas.
5. **Atalho tentador a evitar:** apagar a seção da Vercel. Ela contém diagnóstico útil e caro de obter — a
   causa medida do bloqueio de preview (`:22-32`: o e-mail do autor do commit não verificado na conta,
   marcador `vercel-commit-author-required`). Quem for reativar a Vercel precisa disso. Marque como
   "histórico/diagnóstico", não delete.
6. **Segundo atalho a evitar:** corrigir o `homepage` do repositório no GitHub por conta própria enquanto o
   host final não está decidido — isso é configuração de repositório e vai junto da decisão das 063–068.

**Arquivos e objetos a tocar:** `docs/agentes/deploy.md` (bloco `:6-20`, mais um aviso novo sobre a
assimetria). Se o resumo do `AGENTS.md` ficar contraditório, ajuste **a frase** correspondente na seção
"Serviços" — não a seção.

**Não tocar / armadilhas:** não toque em `docs/RUNBOOK.md` nesta etapa (é o procedimento do Lovable; se
estiver errado, é outra etapa). **Armadilha:** `docs/agentes/*.md` é vigiado por
`scripts/check-agents-md-integrity.mjs` junto com o `AGENTS.md` — cada arquivo vigiado tem de manter **≥ 50 %
do tamanho de base** (`:30-31`). Uma "limpeza" deste arquivo pode reprovar o CI. Acrescente e corrija; não
enxugue.

**Depende de:** — (mas releia depois das 063–068 e atualize, se o host mudar) · **Libera:** —

**Risco e como reverter:** nenhum risco técnico. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não** (documentação).

**Como verificar:** `node scripts/check-agents-md-integrity.mjs` → exit 0. E teste de leitura, que é o que
realmente importa aqui: peça a uma sessão nova "onde este projeto publica o front-end e o que acontece quando
eu mergeio na `main`?" — a resposta, lendo só o `AGENTS.md` e este arquivo, tem de ser "Lovable, por botão
manual; o merge publica edge function, não publica front". Registre a resposta obtida.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso

### (deslocada do nº 062) — `ESTADO-ATUAL.md`: marcar como fechados os três riscos vermelhos de agosto que já foram corrigidos

**Onda / Severidade / Camada:** 1 / **Alta** / Documentação
**Achados resolvidos:** DOC-01 (3 de 3)

**Problema hoje:** o `AGENTS.md` manda ler o `ESTADO-ATUAL.md` **antes de qualquer tarefa** (§1 veredito, §4
riscos, §13 mapa). O arquivo é de **2026-08-16**, e três dos seus riscos 🔴 já não são verdade:

| Afirmação                                                                | Medido agora                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| §4.2 🔴 `user_roles` com RLS desligado + `anon` com INSERT/UPDATE/DELETE | **fechado** — drift check 2026-11-21: `RLS: 221/221`, zero escrita `anon`       |
| §4.3 🔴 176 de 215 tabelas sem RLS                                       | **fechado quanto ao RLS** (221/221)                                             |
| §4.6 🟡 triggers postando para `fqdohnmgmtaycfwsioik`                    | **fechado** por `supabase/migrations/20261120162913_fix_exfil_trigger_urls.sql` |
| §3 drift real (migration registrada ≠ aplicada)                          | **não se reproduz**: `repo=338 banco=338`, faltam 0 dos dois lados              |

Impacto: **o próximo agente vai consertar o que já está consertado e ignorar o que está aberto** — esta
auditoria quase fez isso. E há um efeito pior: lendo §4, o agente conclui que o risco está no **banco**,
quando o banco foi endurecido entre setembro e novembro e o risco migrou para as **edge functions** (89
deployadas sem JWT, 24 sem autenticação própria, 7 gastando LLM sem orçamento).

**Causa raiz:** um documento de diagnóstico datado foi promovido a leitura obrigatória permanente, sem
mecanismo de expiração nem de atualização quando o defeito é corrigido.

**Caminho recomendado:**

1. **Não reescreva o arquivo.** Ele é o registro de uma auditoria de uma data — reescrevê-lo destrói a
   história e a comparação. Em vez disso, **anote cada item fechado no próprio item**, no formato
   `✅ FECHADO em <data> — <evidência>`, mantendo o texto original visível abaixo. Esse é o padrão que torna o
   documento útil como linha do tempo em vez de verdade atemporal.
2. **Ponha a data e o escopo no topo, em uma linha**: "medido em 2026-08-16; itens revisados em 2026-11-22
   pela auditoria de `docs/qa/`". Sem isso, a leitura de §1 continua soando presente.
3. **Preserve as ressalvas, porque elas ainda valem e é fácil varrê-las junto com o item**:
   - o drift check **não** checa `SELECT` para `anon` nem o **conteúdo** das policies — RLS ligada com policy
     ruim continua vazando, e isso **segue não coberto**;
   - §2.2 ("210 de 215 tabelas vazias") **não foi verificado** nesta sessão: não use como fato novo nem o
     declare fechado;
   - §4.1 (`exec_sql`) **não** entra como fechado — é a etapa 053, que ainda vai medir. Escrever "fechado"
     aqui sem o resultado dela seria repetir o defeito que esta etapa conserta.
4. Aponte, de §4, para onde o risco está agora: uma linha referenciando `docs/qa/03-ACHADOS.md` e as causas
   raiz A, B e C. É o que evita a conclusão errada do parágrafo "Impacto".
5. **Atalho tentador a evitar:** apagar as seções fechadas. Além de perder a história, dispara o guard:
   `scripts/check-agents-md-integrity.mjs` reprova encolhimento, e §13 do próprio `ESTADO-ATUAL.md` é o mapa
   referenciado pelo `AGENTS.md` — links quebrados levam o próximo agente a lugar nenhum.
6. **Segundo atalho a evitar:** marcar como fechado algo que você não mediu nesta sessão. A evidência
   aceitável é o log do `DB Drift Check` (o run de 2026-11-21) ou uma consulta sua — não a existência de uma
   migration no repositório. Migration registrada ≠ aplicada é, literalmente, o tema de §3.

**Arquivos e objetos a tocar:** `ESTADO-ATUAL.md` (§1 uma linha de data; §3; §4.2, §4.3 e §4.6 — anotação de
fechamento).

**Não tocar / armadilhas:** não toque em §5.1 (dado sintético em `PromptExperimentsPage.tsx`) — **continua
aberto** e é o achado DATA-01. Não toque em §4.5 (`rag-embed-backfill` pública com `service_role`): continua
aberto e, medido agora, é **pior** do que o documento diz (24 functions sem autenticação, não "outras 16").
Não toque em §15 (auto-validação) — é o registro dos erros de método da auditoria anterior e tem valor
próprio.

**Depende de:** 053 (para saber se §4.1 fecha ou não) · **Libera:** —

**Risco e como reverter:** nenhum risco técnico; o risco é marcar como fechado o que está aberto — e isso
custa caro, porque é exatamente o defeito que esta etapa corrige. Reverter: `git revert`.

**Precisa de aprovação humana antes do merge:** **não** (documentação).

**Como verificar:** `node scripts/check-agents-md-integrity.mjs` → exit 0. E o mesmo teste de leitura da
etapa 061, aplicado ao que importa: peça a uma sessão nova "qual é hoje o maior risco de segurança deste
projeto?" lendo só `AGENTS.md` + `ESTADO-ATUAL.md` — a resposta tem de apontar para as **edge functions**, e
não para RLS de tabela. Registre a resposta: é a única verificação que mede o que esta etapa pretende
mudar.

**Checklist de conclusão:**

- [ ] mudança aplicada só nos arquivos listados
- [ ] typecheck, lint e testes dos arquivos tocados passam
- [ ] verificação acima executada, com a evidência registrada
- [ ] deploy confirmado, quando se aplica
- [ ] etapa marcada no arquivo de progresso
