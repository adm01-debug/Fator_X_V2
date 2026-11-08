---
name: fator-x-v2
description: Convenções de código e commit do Fator X V2 / Nexus Agents Studio (TypeScript, Conventional Commits, design system nexus-design). Use ao alterar código, criar testes ou escrever mensagem de commit neste repositório; as regras operacionais ficam em AGENTS.md.
---

# Fator X V2 (Nexus Agents Studio) — convenções

As regras de trabalho (banco, fluxo Git, PR, comunicação) estão em `AGENTS.md` na raiz — este skill só
resume convenções de código e commit.

## Commits

Conventional Commits: `<tipo>(<escopo>): <descrição>` — escopo opcional e minúsculo, assunto sem ponto final,
tipos `feat fix docs style refactor perf test build ci chore security revert`. Mensagem em PT-BR, imperativo,
primeira linha curta. **Não há hook `commit-msg` neste repo** (só `pre-commit` → `npx lint-staged`): a
convenção é sua responsabilidade, e o título da PR alimenta o release-drafter.

Exemplo: `fix(llm-gateway): resolve chave BYO pela coluna encrypted_value`

## Código

- Linguagem: TypeScript (front Vite + React 18 em `src/`, edge functions Deno em `supabase/functions/`).
- Funções `camelCase`, componentes/classes `PascalCase`, constantes `SCREAMING_SNAKE_CASE`.
- Exports nomeados; siga o padrão de import do arquivo vizinho (`@/` aponta para `src/`).
- Acesso a dado só via `src/services/*` usando `supabaseExternal` (`externalClient.ts`); `client.ts` é só auth.
- Edge function nova: CORS da allowlist (`_shared/cors.ts`), preset de `_shared/rate-limiter.ts` (nunca limite
  inline) e checagem de identidade própria se usar `SERVICE_ROLE_KEY`.
- Design system é gate de CI: nada de cor, tipografia ou sombra literal (`nexus-design/no-hardcoded-colors`,
  `no-adhoc-typography`, `no-adhoc-shadows`) nem `any` (`@typescript-eslint/no-explicit-any`).
- Texto de UI entra nas duas tabelas de `src/i18n/translations.ts` (pt-BR e en-US).
- Testes ao lado do módulo (`*.test.ts`/`src/test/`) ou em `e2e/` (Playwright); rode só o que tocou:
  `npx vitest run <caminho>`.
- Nunca dado sintético (`Math.random()`, mock com badge "Live") em tela ou tabela de produção.
