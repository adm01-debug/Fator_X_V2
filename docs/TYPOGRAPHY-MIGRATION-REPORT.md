# Relatório da Migração de Tipografia — Fator X

_Gerado em 11 de julho de 2026_

## 1. Escopo migrado

- **Diretórios varridos:** `src/components`, `src/pages`
- **Tokens ad-hoc removidos:** `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-[10px]`, `text-[11px]`
- **Ocorrências substituídas nesta fase:**
  - `text-xs` / `text-sm` / `text-[10px]` / `text-[11px]`: **4.732 em 428 arquivos**
  - `text-base` / `text-lg`: **279 em 154 arquivos**
- **Total:** **5.011 substituições** em **~430 arquivos**

## 2. Ocorrências residuais (contagem final)

Executado: `rg -c -P "(?<![\w:-])text-(xs|sm|base|lg|\[10px\]|\[11px\])(?![\w-])" src/`

| Categoria | Contagem | Ação |
|---|---:|---|
| Não-prefixadas em código executável | **0** | ✅ Nenhuma pendência |
| Documentação (`TypographyDocsPage.tsx` — strings da tabela e JSDoc) | 5 | ✅ Intencional; arquivo exempto da regra |
| Prefixadas responsivas (`sm:text-sm`, `md:text-sm`, `focus:text-sm`) | 3 | ⚠ Legítimas — mudam de tamanho por breakpoint/estado |

### Detalhamento das residuais

**Documentação (permitidas):**

- `src/pages/TypographyDocsPage.tsx:6` — comentário JSDoc referenciando a regra
- `src/pages/TypographyDocsPage.tsx:35-38` — strings da tabela "Tokens bloqueados"

**Prefixadas (revisar caso a caso):**

- `src/components/layout/AppLayout.tsx:155` — skip-link `focus:text-sm` (estado de foco, legítimo)
- `src/components/ui/input.tsx:11` — input nativo iOS `text-base ... md:text-sm` (previne zoom no iOS — padrão shadcn/ui)
- `src/pages/AutomationCenterPage.tsx:47` — tabs `text-meta sm:text-sm` (up-size em desktop)

## 3. Regra ESLint

Estendida em `eslint.config.js`:

```js
"no-restricted-syntax": [
  "error",
  {
    selector: "Literal[value=/(?:^|\\s)text-(?:xs|sm|base|lg|\\[10px\\]|\\[11px\\])(?:\\s|$)/]",
    message: "Use tokens semânticos (text-meta, text-body-sm, text-body, text-ui, text-title-sm, ...). Ver /docs/typography.",
  },
  {
    selector: "TemplateElement[value.raw=/(?:^|\\s)text-(?:xs|sm|base|lg|\\[10px\\]|\\[11px\\])(?:\\s|$)/]",
    message: "Use tokens semânticos de tipografia.",
  },
],
```

Exceção: `src/pages/TypographyDocsPage.tsx` (documentação legítima).

**Resultado da varredura ESLint completa (`bunx eslint src/`):**

- Violações da regra `no-restricted-syntax` de tipografia: **0**
- Erros pré-existentes fora do escopo desta migração: 525 (majoritariamente `@typescript-eslint/no-explicit-any` em `services/`)

## 4. Regressão visual

- Configuração oficial (`playwright.config.ts` → `lovable-agent-playwright-config`) executa apenas no CI.
- **Sanity check local via Playwright direto:** `/auth` desktop 1280×720 e mobile 375×667 renderizaram sem quebra de layout, sem erros de runtime além de um warning pré-existente sobre CSP `frame-ancestors` em `<meta>` (não relacionado à migração).
- **Atualização de snapshots:** deve ser executada no pipeline CI com `npm run test:e2e:update`; o commit resultante armazenará as baselines em `e2e/__screenshots__/`.

## 5. Checklist final

- [x] Migração de `text-xs`/`text-sm`/`text-[10px]`/`text-[11px]`
- [x] Migração de `text-base`/`text-lg`
- [x] Fix em `src/index.css` (`.nexus-badge`, `.nexus-section-title`)
- [x] ESLint bloqueando os 6 tokens ad-hoc
- [x] Página de documentação viva em `/docs/typography`
- [x] Typecheck `tsgo --noEmit` limpo
- [x] Zero violações de tipografia no ESLint completo
- [x] Sanity check visual (sem regressão de layout)
- [ ] `test:e2e:update` no CI para regravar baselines oficiais (executar no pipeline)
