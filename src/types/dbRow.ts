/**
 * Nexus Agents Studio — Dynamic DB Row Helper
 * ═════════════════════════════════════════════════════════════
 * Tipo utilitário para linhas retornadas dinamicamente pelo
 * Supabase quando o schema explícito ainda não foi gerado ou
 * quando estamos consumindo views/RPCs sem tipos estritos.
 *
 * O uso de `any` como valor do índice é **intencional**: permite
 * acesso via dot notation (`row.field`) em callbacks de `.map()`
 * sem forçar refatorações estruturais em massa. Todas as leituras
 * de campos críticos devem ser validadas via Zod nas fronteiras
 * (services / hooks) antes de propagar para a UI.
 *
 * NÃO use `DbRow` como tipo de retorno público de serviços novos —
 * defina uma interface concreta. Este helper é uma ponte para
 * código legado, não uma licença para tipagem frouxa.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = { [key: string]: any };
