# Guia de Contribuição — Nexus / Agent Studio

Obrigado por contribuir! Este documento define o fluxo padrão para propor mudanças com qualidade **10/10**.

## 🧭 Princípios

1. **Correção antes de velocidade.** Toda mudança precisa passar tipagem, lint, testes e guarda de bundle.
2. **Segurança por padrão.** RLS obrigatório, zero `any`, zero segredos no frontend, zero `console.log` em produção.
3. **Design system primeiro.** Use tokens semânticos (`bg-primary`, `text-foreground`) e a escala tipográfica definida em `src/index.css`. Cores hard-coded (`bg-blue-500`) são rejeitadas automaticamente pelo ESLint.
4. **Documente a intenção.** Commits e PRs explicam *por que*, não apenas *o quê*.

## 🔀 Fluxo de branches

- `main` — protegida, deploy automático em produção.
- `develop` — integração contínua, deploy em staging.
- `feature/<slug>` — novas funcionalidades.
- `fix/<slug>` — correções.
- `chore/<slug>` — infra, refactor, docs.

Rebase em `develop` antes de abrir PR. Merge via **squash** com mensagem no padrão [Conventional Commits](https://www.conventionalcommits.org/).

## ✅ Checklist antes do PR

- [ ] `npm run typecheck` verde
- [ ] `npm run lint` verde (zero warnings novos)
- [ ] `npm test` cobrindo o caminho crítico
- [ ] `npm run check:bundle` dentro do orçamento
- [ ] Migrations em `supabase/migrations/` com `GRANT` + RLS + policies
- [ ] Edge Functions com contrato Zod + CORS + `try/catch`
- [ ] Screenshots ou vídeo curto para mudanças de UI
- [ ] Atualização de `docs/` quando aplicável
- [ ] Um dos code owners marcado como revisor (ver `.github/CODEOWNERS`)

## 🧪 Testes

- **Unit**: Vitest + React Testing Library, colocalizados como `*.test.ts(x)`.
- **Contract**: `supabase/functions/**/__tests__/*.contract.test.ts` para toda Edge Function pública.
- **E2E**: Playwright para fluxos críticos (`auth`, `billing`, `agent-run`).

Cobertura mínima de merge: **80% em `src/services` e `src/lib`**.

## 🔒 Reportando vulnerabilidades

Não abra issue pública. Siga o processo descrito em [`SECURITY.md`](./SECURITY.md).

## 💬 Comunicação

- Dúvidas técnicas → discussão no PR.
- Propostas arquiteturais → issue com template **Feature request**.
- Escopo confuso → converse antes de codar; iteração barata > refactor caro.

Bem-vindo(a) ao time. 🚀
