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
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
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
    files: ["supabase/functions/**/*.ts", "src/lib/logger.ts", "src/test/**/*.test.tsx"],
    rules: {
      "no-console": "off",
    },
  }
);
