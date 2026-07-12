/**
 * Plugin ESLint local: nexus-design
 *
 * Regras autofix para reduzir dívida técnica do design system Nexus.
 *
 * 1. no-hardcoded-colors:
 *    Substitui utilitários Tailwind com cores cruas (bg-red-500, text-blue-600/40, etc.)
 *    pelos tokens semânticos `nexus-*` definidos em tailwind.config.ts.
 *
 * 2. no-adhoc-typography:
 *    Substitui tamanhos ad-hoc (text-xs, text-sm, text-base, text-lg, text-[10px], text-[11px])
 *    pela escala semântica (text-meta, text-body-sm, text-body, text-title-sm).
 *
 * Ambas as regras atuam sobre `Literal` (strings) e `TemplateElement` (template literals),
 * cobrindo assim `className="..."`, `cn("...")` e classes construídas dinamicamente.
 */

const COLOR_MAP = {
  red: 'nexus-red',
  blue: 'nexus-blue',
  green: 'nexus-green',
  yellow: 'nexus-yellow',
  orange: 'nexus-orange',
  purple: 'nexus-purple',
  pink: 'nexus-rose',
  indigo: 'nexus-purple',
  violet: 'nexus-purple',
  fuchsia: 'nexus-purple',
  amber: 'nexus-amber',
  emerald: 'nexus-emerald',
  rose: 'nexus-rose',
  cyan: 'nexus-cyan',
  sky: 'nexus-cyan',
  teal: 'nexus-teal',
  lime: 'nexus-green',
};

const PREFIX =
  '(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|decoration|outline|divide|placeholder|caret|accent)';
const COLOR_NAMES = Object.keys(COLOR_MAP).join('|');
// Captura opcionalmente modificadores como `hover:`, `dark:`, `md:`, `group-hover:`, etc.
const COLOR_REGEX = new RegExp(
  `(?<![\\w-])((?:[a-z-]+:)*)(${PREFIX})-(${COLOR_NAMES})-\\d{2,3}(/\\d+)?`,
  'g',
);

const TYPO_MAP = {
  'text-xs': 'text-meta',
  'text-sm': 'text-body-sm',
  'text-base': 'text-body',
  'text-lg': 'text-title-sm',
  'text-[10px]': 'text-meta',
  'text-[11px]': 'text-meta',
};
const TYPO_REGEX = new RegExp(
  `(?<![\\w-])((?:[a-z-]+:)*)(text-(?:xs|sm|base|lg|\\[10px\\]|\\[11px\\]))(?![\\w-])`,
  'g',
);

/**
 * Reporta e corrige substrings dentro de um nó, preservando delimitadores.
 */
function reportMatches(context, node, raw, regex, buildReplacement, message) {
  const matches = [...raw.matchAll(regex)];
  if (matches.length === 0) return;

  const rawText = context.getSourceCode().getText(node);
  // Detecta offset entre o valor lógico (`raw`) e o texto real do source
  // (Literal inclui aspas; TemplateElement pode ter escapes).
  // Estratégia simples: se o rawText contém `raw`, use o offset direto;
  // caso contrário, corrija por match sequencial no rawText.
  const useDirect = rawText.includes(raw);
  const baseOffset = useDirect ? rawText.indexOf(raw) : -1;

  for (const m of matches) {
    const replacement = buildReplacement(m);
    if (replacement === m[0]) continue;

    let start, end;
    if (useDirect) {
      start = node.range[0] + baseOffset + m.index;
      end = start + m[0].length;
    } else {
      const idx = rawText.indexOf(m[0]);
      if (idx === -1) continue;
      start = node.range[0] + idx;
      end = start + m[0].length;
    }

    context.report({
      node,
      loc: {
        start: context.getSourceCode().getLocFromIndex(start),
        end: context.getSourceCode().getLocFromIndex(end),
      },
      message: message(m, replacement),
      fix(fixer) {
        return fixer.replaceTextRange([start, end], replacement);
      },
    });
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedColors = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Proíbe cores Tailwind cruas (bg-red-500) — use tokens nexus-* do design system.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      replace:
        'Cor Tailwind crua "{{from}}" — substitua pelo token do design system "{{to}}".',
    },
  },
  create(context) {
    const check = (node, raw) => {
      reportMatches(
        context,
        node,
        raw,
        COLOR_REGEX,
        (m) => {
          const [, modifiers, prefix, colorName, opacity = ''] = m;
          const token = COLOR_MAP[colorName];
          return `${modifiers}${prefix}-${token}${opacity}`;
        },
        (m, replacement) => ({
          messageId: 'replace',
          data: { from: m[0], to: replacement },
        }),
      );
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noAdhocTypography = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Proíbe tamanhos de fonte Tailwind ad-hoc — use tokens semânticos (text-meta, text-body-sm, text-body, text-title-sm).',
    },
    fixable: 'code',
    schema: [],
    messages: {
      replace:
        'Tipografia ad-hoc "{{from}}" — use o token semântico "{{to}}". Ver /docs/typography.',
    },
  },
  create(context) {
    const check = (node, raw) => {
      reportMatches(
        context,
        node,
        raw,
        TYPO_REGEX,
        (m) => {
          const [, modifiers, cls] = m;
          return `${modifiers}${TYPO_MAP[cls]}`;
        },
        (m, replacement) => ({
          messageId: 'replace',
          data: { from: m[0], to: replacement },
        }),
      );
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default {
  rules: {
    'no-hardcoded-colors': noHardcodedColors,
    'no-adhoc-typography': noAdhocTypography,
  },
};
