# 🚀 Onboarding — Nexus Agents Studio

Bem-vindo ao Nexus! Este guia ajudará você a configurar seu ambiente de desenvolvimento local.

## 🛠 Pré-requisitos
- Node.js 20+
- npm 9+
- Git
- Lovable CLI (opcional)

## 📦 Instalação
1. Clone o repositório
2. `npm install`
3. Crie um arquivo `.env` baseado no `.env.example`

## 🏗 Arquitetura
O Nexus utiliza uma arquitetura **Dual-Client**:
- `supabase`: Cliente local para autenticação e metadados.
- `supabaseExternal`: Cliente para o banco de dados principal de produção.

## 🔬 Testes
- Unitários: `npm test`
- E2E: `npx playwright test`
- RLS: `tests/rls/personas.test.ts`

## 📜 Convenções
- **Commits**: Usar Conventional Commits (`feat:`, `fix:`, `chore:`)
- **Tipagem**: Zero `any`. Use tipos gerados do Supabase.
- **Logs**: Use o `logger` do `@/lib/logger` em vez de `console.log`.

---
*Nexus Agents Studio 2026 — 10/10 Quality Enforced*
