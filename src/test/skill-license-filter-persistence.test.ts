/**
 * Simulação de hidratação do filtro de licença do marketplace.
 *
 * Motivação: o valor do filtro passa a viver fora do processo (Cloud +
 * localStorage + BroadcastChannel entre abas). Isso significa que ele pode
 * voltar corrompido, de uma versão futura do app, ou editado à mão pelo
 * usuário no DevTools. Um `Select` do Radix com `value` inválido perde o
 * rótulo, e um filtro inválido aplicado sem defesa esvaziaria o catálogo — o
 * pior modo de falha possível para uma tela de descoberta.
 *
 * Aqui exercitamos o produto cartesiano de payloads plausíveis e hostis para
 * provar que `normalizeLicenseFilter` é total: sempre devolve um dos modos
 * declarados em `LICENSE_FILTERS`, jamais lança.
 */
import { describe, it, expect } from 'vitest';
import {
  LICENSE_FILTERS,
  isLicenseFilter,
  normalizeLicenseFilter,
  matchesLicenseFilter,
  type LicenseFilter,
} from '@/lib/skills/attribution';

const VALID = LICENSE_FILTERS.map((f) => f.value);

/** Variações textuais que um humano ou um serializador pode produzir. */
const CASE_MUTATIONS: ReadonlyArray<(s: string) => string> = [
  (s) => s,
  (s) => s.toUpperCase(),
  (s) => `  ${s}  `,
  (s) => `\t${s}\n`,
  (s) => s[0].toUpperCase() + s.slice(1),
];

/** Payloads que NÃO devem ser aceitos, mas também não podem quebrar. */
const HOSTILE_VALUES: readonly unknown[] = [
  undefined,
  null,
  '',
  '   ',
  'ALL_LICENSES',
  'copy-left',
  'permissivas',
  'proprietary',
  '__proto__',
  'constructor',
  'toString',
  0,
  1,
  NaN,
  Infinity,
  true,
  false,
  [],
  ['permissive'],
  {},
  { value: 'permissive' },
  () => 'permissive',
  Symbol('permissive'),
  new Date(),
  /permissive/,
  'permissive; DROP TABLE skill_registry;--',
  '<script>alert(1)</script>',
  'ａll', // caractere fullwidth — homoglifo
  'all\u0000',
  'permissive'.repeat(1000),
];

describe('normalizeLicenseFilter — totalidade sob payload persistido', () => {
  it('preserva todos os modos válidos em suas variações textuais', () => {
    let checked = 0;
    for (const value of VALID) {
      for (const mutate of CASE_MUTATIONS) {
        expect(normalizeLicenseFilter(mutate(value))).toBe(value);
        checked += 1;
      }
    }
    expect(checked).toBe(VALID.length * CASE_MUTATIONS.length);
  });

  it('degrada qualquer payload hostil para "all" sem lançar', () => {
    for (const value of HOSTILE_VALUES) {
      expect(() => normalizeLicenseFilter(value)).not.toThrow();
      expect(normalizeLicenseFilter(value)).toBe('all');
    }
  });

  it('é idempotente: normalizar duas vezes não muda o resultado', () => {
    const inputs: readonly unknown[] = [
      ...VALID,
      ...VALID.flatMap((v) => CASE_MUTATIONS.map((m) => m(v))),
      ...HOSTILE_VALUES,
    ];
    for (const input of inputs) {
      const once = normalizeLicenseFilter(input);
      expect(normalizeLicenseFilter(once)).toBe(once);
    }
  });

  it('o resultado é sempre um valor aceito por isLicenseFilter', () => {
    const inputs: readonly unknown[] = [...VALID, ...HOSTILE_VALUES];
    for (const input of inputs) {
      expect(isLicenseFilter(normalizeLicenseFilter(input))).toBe(true);
    }
  });

  it('sobrevive a um round-trip JSON (Cloud/localStorage/BroadcastChannel)', () => {
    for (const value of VALID) {
      const wire = JSON.parse(JSON.stringify({ license: value })) as {
        license: unknown;
      };
      expect(normalizeLicenseFilter(wire.license)).toBe(value);
    }
    // Payload de versão futura: campo ausente ou renomeado.
    const legado = JSON.parse('{"licence":"copyleft"}') as Record<string, unknown>;
    expect(normalizeLicenseFilter(legado.license)).toBe('all');
  });

  it('filtro hidratado corrompido nunca esvazia o catálogo', () => {
    const skill = {
      source_repo: 'obra/superpowers',
      source_url: 'https://github.com/obra/superpowers',
      source_license: 'MIT',
    };
    for (const value of HOSTILE_VALUES) {
      const filter = normalizeLicenseFilter(value);
      expect(matchesLicenseFilter(skill, filter)).toBe(true);
    }
  });

  it('cada modo normalizado tem rótulo e dica para renderizar no Select', () => {
    for (const value of VALID) {
      const entry = LICENSE_FILTERS.find(
        (f) => f.value === (normalizeLicenseFilter(value) as LicenseFilter),
      );
      expect(entry).toBeDefined();
      expect(entry?.label.length).toBeGreaterThan(0);
      expect(entry?.hint.length).toBeGreaterThan(0);
    }
  });
});
