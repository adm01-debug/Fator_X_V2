/**
 * Testes unitários do plugin ESLint local `nexus-design`.
 *
 * Cobre:
 *  - no-hardcoded-colors: mapeamento de cores Tailwind cruas → tokens nexus-*
 *  - no-adhoc-typography: mapeamento de tamanhos ad-hoc → escala semântica
 *  - Autofix (output) preservando modificadores (hover:, dark:, md:) e opacidade (/40)
 *  - Cobertura em Literal (className="...") e TemplateElement (cn(`...`))
 *  - Ausência de falsos positivos em classes já corretas
 */
import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
// @ts-expect-error — plugin JS sem tipos
import nexusDesign from '../../eslint-plugins/nexus-design.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

const colorRule = nexusDesign.rules['no-hardcoded-colors'];
const typoRule = nexusDesign.rules['no-adhoc-typography'];

describe('nexus-design/no-hardcoded-colors', () => {
  it('mapeia cores diretas em className', () => {
    ruleTester.run('no-hardcoded-colors', colorRule, {
      valid: [
        { code: 'const x = "bg-nexus-blue text-nexus-red";' },
        { code: 'const x = "bg-primary text-foreground";' },
        { code: 'const x = "flex items-center gap-2";' },
      ],
      invalid: [
        {
          code: 'const x = "bg-red-500 text-blue-600";',
          output: 'const x = "bg-nexus-red text-nexus-blue";',
          errors: 2,
        },
        {
          code: 'const x = "hover:bg-green-500 dark:text-yellow-400";',
          output: 'const x = "hover:bg-nexus-green dark:text-nexus-yellow";',
          errors: 2,
        },
        {
          code: 'const x = "border-purple-500/40";',
          output: 'const x = "border-nexus-purple/40";',
          errors: 1,
        },
        {
          code: 'const x = "md:group-hover:from-pink-500";',
          output: 'const x = "md:group-hover:from-nexus-rose";',
          errors: 1,
        },
        {
          code: 'const x = "ring-cyan-300 fill-emerald-400 stroke-amber-500";',
          output: 'const x = "ring-nexus-cyan fill-nexus-emerald stroke-nexus-amber";',
          errors: 3,
        },
      ],
    });
    expect(true).toBe(true);
  });

  it('cobre template literals usados em cn()', () => {
    ruleTester.run('no-hardcoded-colors', colorRule, {
      valid: [{ code: 'const x = `bg-nexus-blue`;' }],
      invalid: [
        {
          code: 'const x = `bg-red-500 ${cond} text-blue-600`;',
          output: 'const x = `bg-nexus-red ${cond} text-nexus-blue`;',
          errors: 2,
        },
      ],
    });
    expect(true).toBe(true);
  });

  it('não confunde tokens nexus-* nem palavras contendo cores', () => {
    ruleTester.run('no-hardcoded-colors', colorRule, {
      valid: [
        { code: 'const x = "bg-nexus-red hover:bg-nexus-blue";' },
        { code: 'const x = "text-red";' }, // sem dígito → não é utilitário Tailwind alvo
      ],
      invalid: [],
    });
    expect(true).toBe(true);
  });
});

describe('nexus-design/no-adhoc-typography', () => {
  it('mapeia tamanhos ad-hoc para tokens semânticos', () => {
    ruleTester.run('no-adhoc-typography', typoRule, {
      valid: [
        { code: 'const x = "text-meta text-body-sm text-body text-title-sm";' },
        { code: 'const x = "text-hero text-numeric";' },
      ],
      invalid: [
        {
          code: 'const x = "text-xs text-sm text-base text-lg";',
          output: 'const x = "text-meta text-body-sm text-body text-title-sm";',
          errors: 4,
        },
        {
          code: 'const x = "text-[10px] text-[11px]";',
          output: 'const x = "text-meta text-meta";',
          errors: 2,
        },
        {
          code: 'const x = "md:text-sm hover:text-base";',
          output: 'const x = "md:text-body-sm hover:text-body";',
          errors: 2,
        },
      ],
    });
    expect(true).toBe(true);
  });

  it('funciona em template literals', () => {
    ruleTester.run('no-adhoc-typography', typoRule, {
      valid: [{ code: 'const x = `text-body`;' }],
      invalid: [
        {
          code: 'const x = `text-xs ${v} text-lg`;',
          output: 'const x = `text-meta ${v} text-title-sm`;',
          errors: 2,
        },
      ],
    });
    expect(true).toBe(true);
  });

  it('não altera classes já semânticas nem sufixos parecidos', () => {
    ruleTester.run('no-adhoc-typography', typoRule, {
      valid: [
        { code: 'const x = "text-body text-meta text-title-lg";' },
        { code: 'const x = "text-muted-foreground";' },
      ],
      invalid: [],
    });
    expect(true).toBe(true);
  });
});
