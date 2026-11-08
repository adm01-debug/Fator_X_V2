# Estado real do projeto — inventário gerado

Pasta de **dados gerados por script**, não de relatórios escritos à mão. É a fonte de consulta dos
agentes para "o que existe hoje" no banco e nas edge functions. Se um número aqui divergir do que
você mediu, regere o arquivo (comandos abaixo) em vez de corrigir à mão.

Portado do Zapp Web V2 (`scripts/inventario/`). Rotas/telas **não** saem daqui: quem produz é o
`scripts/ai-context/gerar.mjs` (workflow `contexto.yml` → `docs/contexto/codigo/rotas.json`).

| Arquivo | Como gerar | O que tem |
|---|---|---|
| `edges.json` | `node scripts/inventario/gerar-repo.mjs` (precisa de `rg`) | cada edge function: linhas, segredos lidos (`Deno.env.get`) e quem a invoca (src, migrations, outras edges, e2e, CI), mais as que ninguém chama |
| `banco.json` | `SUPABASE_ACCESS_TOKEN=... node scripts/inventario/gerar-banco.mjs` (Management API: `/database/query/read-only` + `/functions`, só leitura) **ou**, sem token, rodar `scripts/inventario/banco.sql` no MCP do Supabase, salvar a resposta e `node scripts/inventario/gerar-banco.mjs --entrada <arquivo>` | banco oficial `qdlnzopxrlsoljcrcmzv`, só leitura: cada tabela (RLS, policies, triggers, linhas, tamanho, se é citada em função/view e quantos `.from()` e `/rest/v1/<tabela>` tem em `src/` e `supabase/functions/`), tabelas órfãs, cada cron job (agenda, funções chamadas, falhas e taxa em 24 h/7 d, duração máxima), horas em que o cron ficou parado, tamanho do histórico do cron, edge functions publicadas × pastas do repo (só com token) e a lista `alertas` |
| `tabelas-uso.json` (não versionado) | `node scripts/inventario/gerar-repo.mjs < lista-de-tabelas.txt` | quantos `.from('tabela')` cada tabela tem — hoje também sai em `banco.json` → `tabelas[].uso_no_codigo` |

## Pré-requisitos do `banco.json` (ainda não atendidos neste repo)

1. Secret `SUPABASE_ACCESS_TOKEN` (Settings → Secrets and variables → Actions) com acesso de leitura
   ao projeto `qdlnzopxrlsoljcrcmzv`.
2. `supabase/schema-manifest.json` no repo — é a foto do schema contra a qual a resposta do banco é
   conferida antes de gravar. Produzido pelo `types-sync` (não portado ainda).

Sem os dois, o `inventario-estado-semanal.yml` sai verde com aviso e refaz só o `edges.json`.

## Como ler `banco.json`

- **`alertas`** é o que um agente precisa saber antes de mexer: `tabela_sem_rls`, `rls_sem_policy`,
  `cron_falhando` (taxa ≥ 5 % em 7 dias), `cron_parado` (hora com mais da metade das execuções
  falhando), `cron_sem_execucao` (job ativo que roda todo dia sem nenhuma execução em 24 h — o cron
  100 % parado não grava falha, então só aparece aqui), `historico_cron_sem_limpeza` (> 50 mil linhas
  com mais de 7 dias), `edge_sem_deploy` e `edge_publicada_sem_codigo`. Os limiares estão em
  `LIMIARES` no script.
- **`tabelas_orfas`**: 0 linhas + não citada em função/view do banco + nenhum `.from()` nem
  `/rest/v1/` no código (`.from(variavel)` não é resolvido). Candidata a limpeza, **não** prova de
  que pode apagar (pode ser usada por RPC com outro nome ou por sistema externo).
- **`linhas`** é `count(*)` exato quando a tabela tem menos de 200 mil linhas (`linhas_exatas: true`);
  acima disso, a estimativa do planner.
- Contagens rodam com o papel da conexão. Com um papel sem `rolbypassrls`, tabelas com RLS e
  `cron.job` podem vir incompletas.
- A resposta só é gravada se as tabelas baterem (≥ 90 %, nos dois sentidos) com
  `supabase/schema-manifest.json` **e** o ledger bater com `supabase/migrations/`: maior versão
  aplicada entre as 20 migrations mais recentes do repo (ou à frente) e quantidade de registros a até
  10 % da de arquivos. Barra resposta colada de outro banco.
- O PR semanal só abre quando algo **estrutural** mudou: tabela nova/apagada, alerta novo,
  RLS/policy, contagem real de linhas, edge etc. `medido_em`/`gerado_em` e a telemetria viva do cron
  (`execucoes_24h`, `taxa_falha_7d_pct`, `horas_paradas_7d`, `cron.historico.linhas/bytes`) não abrem
  PR sozinhos: rolam toda semana só pela janela de 7 dias. Consequência: esses campos no arquivo
  commitado podem ficar atrasados por tempo indefinido — confie neles só depois de regenerar.
- Nada de segredo sai do banco: de `cron.job` só o nome das funções chamadas, nunca o comando (que
  pode ter URL/cabeçalho). O teste `scripts/ci/inventario-banco.unit.mjs` barra escrita no SQL, e o
  script se recusa a gravar saída com cara de credencial (Bearer, JWT, `sb_secret_`).
