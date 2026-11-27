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
## Grants de anon em funcoes (2026-11-27, PR #209)

`PUBLIC` recebe `EXECUTE` por padrao em toda funcao nova. As migrations de
2026-09-05 revogaram isso apenas para **tabelas**, entao toda funcao criada
depois nasceu executavel por `anon`.

Medido no catalogo antes e depois da migration
`20261129013000_anon_sem_execute_em_funcoes.sql`:

| Metrica | Antes | Depois |
|---|---|---|
| RPCs executaveis por `anon` | 88 | **0** |
| RPCs acessiveis a `authenticated` | 88 | **121** |
| `_fase8_snapshot_as(uuid)` | presente | **removida** |
| Tabelas com `INSERT` para `anon` | - | **0 de 267** |

`_fase8_snapshot_as` era `SECURITY DEFINER` e injetava o `sub` de qualquer
uuid via `set_config` antes de chamar `get_db_health_snapshot()`: um bypass
de autenticacao alcancavel sem login.

Para reconferir:

```bash
gh workflow run schema-probe.yml -f sql="select count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_pode from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype"
```
