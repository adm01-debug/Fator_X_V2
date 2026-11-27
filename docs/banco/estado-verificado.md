# Estado verificado do banco de produção

Prova coletada pela sonda `schema-probe.yml` (Management API, somente leitura) em 2026-11-27, sobre a `main` `1e12e712`.

## Como reproduzir

```
gh workflow run schema-probe.yml --ref main -f sql="<sua consulta somente leitura>"
```

## Resultados

| Verificação | Como | Resultado |
|---|---|---|
| Migrations pendentes | `supabase db push` | **"Remote database is up to date."** |
| Funções 2FA e busca híbrida | `select proname from pg_proc where proname in (...)` | `disable_my_2fa`, `enable_my_2fa`, `hybrid_search_notebook`, `verify_my_2fa` |
| Tabelas-chave | `select ... from pg_tables where tablename in (...)` | `agent_traces`, `agent_usage`, `alert_rules`, `chunks`, `prompt_versions`, `retention_job_runs` |
| Cobertura de RLS | `count(*) filter (where not relrowsecurity)` | **0 de 233** tabelas em `public` sem RLS |
| Policies | `select count(*) from pg_policies where schemaname='public'` | **884** |

## O que isso encerra

As 15 migrations de `20261127170000` a `20261129012000` estão aplicadas. O front publicado na `main` (`use2FA.ts`, `notebookSearchService.ts`, `alertRulesService.ts`) chama objetos que **existem** em produção — não há tela quebrada por função ausente.

O lote da #203 recuperou o commit `0ca96ae6` da #196, que havia ficado fora do merge e continha duas correções de segurança: `rotinas_sistema_service_role` (fechava `cleanup_auth_attempts`, que apagava evidência de login de todos) e `custos_anomalias_escopo_chamador` (corrigia o `INSERT` de `compute_cost_baselines`, que sempre falhava).