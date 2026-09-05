import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import nexusDesign from "./eslint-plugins/nexus-design.js";

export default tseslint.config(
  { ignores: ["dist", "eslint-plugins/**", "**/*.css"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      "nexus-design": nexusDesign,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // Regras autofix do design system Nexus — substituem cores e tipografia ad-hoc
      // pelos tokens semânticos definidos em tailwind.config.ts / index.css.
      "nexus-design/no-hardcoded-colors": "error",
      "nexus-design/no-adhoc-typography": "error",
      "nexus-design/no-adhoc-shadows": "error",
      // ── jsx-a11y: rebaixadas a warn ──
      // O projeto usa Radix UI primitives (via shadcn) que já entregam
      // keyboard-navigation, ARIA states e focus trap corretamente. Regras que
      // não conseguem detectar essa composição geram falsos positivos em massa
      // e mascaram problemas reais de a11y — mantemos como warn para visibilidade
      // sem falhar o build.
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/aria-activedescendant-has-tabindex": "warn",
    },
  },
  {
    files: ["src/pages/TypographyDocsPage.tsx", "src/index.css"],
    rules: {
      "nexus-design/no-adhoc-typography": "off",
      "nexus-design/no-hardcoded-colors": "off",
      "nexus-design/no-adhoc-shadows": "off",
    },
  },
  {
    files: ["supabase/functions/**/*.ts", "src/lib/logger.ts", "src/test/**/*.test.tsx", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Shadcn primitives, providers e componentes que legitimamente exportam
    // constantes/variantes/contextos ao lado do componente. Fast Refresh não
    // se aplica a esses módulos — silenciar sem perder cobertura no restante.
    files: [
      "src/components/ui/**/*.tsx",
      "src/contexts/**/*.tsx",
      "src/i18n/**/*.tsx",
      "src/hooks/**/*.tsx",
      "src/components/rbac/AccessControl.tsx",
      "src/components/**/nodes/CustomNodes.tsx",
      "src/components/**/*FieldRenderers.tsx",
      "src/components/**/*SubComponents.tsx",
      "src/components/**/*StepComponents.tsx",
      "src/components/agents/versioning/TimelineRangeFilter.tsx",
      "src/components/agents/traces/ClearFiltersConfirm.tsx",
      "src/components/agents/detail/RestoreChangelogEditor.tsx",
      "src/components/agents/wizard/quickSteps/PreflightReviewSummary.tsx",
      "src/components/agents/wizard/quickSteps/PromptSectionChecklist.tsx",
      "src/components/charts/ComparisonToggle.tsx",
      "src/components/dashboard/DateRangePicker.tsx",
      "src/components/datahub/ConnectionCard.tsx",
      "src/components/datahub/EntityDetailPanel.tsx",
      "src/components/monitoring/AdvancedTraceFilters.tsx",
      "src/components/monitoring/LangfuseExporterDialog.tsx",
      "src/components/prompts/PromptDiff.tsx",
      "src/components/sandbox/SandboxConfigTab.tsx",
      "src/components/super-cerebro/CerebroTabNav.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  }
);
