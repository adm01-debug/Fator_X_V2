import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
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
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      // Bloqueia tokens de tipografia ad-hoc — use a escala semântica
      // (text-meta, text-caption, text-body-sm, text-body, text-ui,
      //  text-title-sm, text-title, text-title-lg, text-hero, text-hero-lg).
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(?:^|\\s)text-(?:xs|sm|base|lg|\\[10px\\]|\\[11px\\])(?:\\s|$)/]",
          message:
            "Use os tokens de tipografia semânticos (text-meta, text-body-sm, text-body, text-ui, text-title-sm, etc.) em vez de text-xs, text-sm, text-base, text-lg, text-[10px] ou text-[11px]. Ver /docs/typography.",
        },
        {
          selector: "TemplateElement[value.raw=/(?:^|\\s)text-(?:xs|sm|base|lg|\\[10px\\]|\\[11px\\])(?:\\s|$)/]",
          message:
            "Use os tokens de tipografia semânticos (text-meta, text-body-sm, text-body, text-ui, text-title-sm, etc.) em vez de text-xs, text-sm, text-base, text-lg, text-[10px] ou text-[11px].",
        },
      ],
    },
  },
  {
    files: ["src/pages/TypographyDocsPage.tsx", "src/index.css"],
    rules: {
      "no-restricted-syntax": "off",
    },

  },
  {
    files: ["supabase/functions/**/*.ts", "src/lib/logger.ts", "src/test/**/*.test.tsx"],
    rules: {
      "no-console": "off",
    },
  }
);