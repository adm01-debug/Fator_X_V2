/**
 * Simulação determinística de centenas de cenários de atribuição de skills.
 *
 * Estratégia: produto cartesiano de licenças (válidas, aliases, sujas, hostis)
 * × URLs (seguras e hostis) × repositórios × autores, verificando invariantes
 * que precisam valer para *toda* combinação — em vez de exemplos pontuais.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillAttribution,
  isCopyleft,
  isKnownLicense,
  KNOWN_LICENSES,
  normalizeLicense,
  repoLabelFromUrl,
  requiresAttributionNotice,
  safeSourceUrl,
} from '@/lib/skills/attribution';

const LICENSE_INPUTS: Array<string | null | undefined> = [
  ...KNOWN_LICENSES,
  ...KNOWN_LICENSES.map((l) => l.toLowerCase()),
  'mit',
  'MIT License',
  'The MIT License',
  'apache 2.0',
  'Apache License 2.0',
  'ASL2',
  'bsd',
  'BSD 3-Clause',
  'ISC License',
  'GPLv3',
  'cc0',
  'public domain',
  'the unlicense',
  '  MIT  ',
  'NOASSERTION',
  'unknown',
  'none',
  'null',
  '',
  '   ',
  'Licença Proprietária Interna',
  'MIT\u0000',
  'MIT\nLicense',
  null,
  undefined,
];

const URL_INPUTS: Array<string | null | undefined> = [
  'https://github.com/addyosmani/agent-skills',
  'https://github.com/obra/superpowers/tree/main/skills',
  'https://github.com/smixs/agent-second-brain.git',
  'https://gitlab.com/grupo/projeto',
  'https://raw.githubusercontent.com/o/r/main/SKILL.md',
  'https://example.com',
  'https://example.com/',
  'http://github.com/o/r',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///etc/passwd',
  'ftp://example.com/x',
  'https://user:senha@github.com/o/r',
  'https://:token@github.com/o/r',
  'https://github .com/o/r',
  'https://github.com/o/r\nX',
  'https://localhost/o/r',
  'não é url',
  '',
  '   ',
  `https://example.com/${'a'.repeat(2100)}`,
  null,
  undefined,
];

const REPO_INPUTS: Array<string | null | undefined> = [
  'addyosmani/agent-skills',
  'obra/superpowers',
  '  smixs/agent-second-brain  ',
  '',
  '   ',
  'x'.repeat(200),
  null,
  undefined,
];

describe('normalizeLicense — invariantes sobre todas as entradas', () => {
  for (const input of LICENSE_INPUTS) {
    it(`é idempotente e saneada para ${JSON.stringify(input)}`, () => {
      const once = normalizeLicense(input);
      const twice = normalizeLicense(once);
      expect(twice).toBe(once);

      if (once !== null) {
        expect(once.length).toBeGreaterThan(0);
        expect(once.length).toBeLessThanOrEqual(60);
        expect(once).toBe(once.trim());
        // eslint-disable-next-line no-control-regex
        expect(/[\u0000-\u001f\u007f]/.test(once)).toBe(false);
      }
    });
  }

  it('reconhece todos os SPDX do catálogo em qualquer caixa', () => {
    for (const license of KNOWN_LICENSES) {
      expect(normalizeLicense(license.toUpperCase())).toBe(license);
      expect(normalizeLicense(license.toLowerCase())).toBe(license);
      expect(isKnownLicense(normalizeLicense(license))).toBe(true);
    }
  });

  it('trata sentinelas de ausência como nulo', () => {
    for (const sentinel of ['NOASSERTION', 'unknown', 'none', 'null', '', '   ']) {
      expect(normalizeLicense(sentinel)).toBeNull();
    }
  });

  it('preserva licenças desconhecidas sem promovê-las a SPDX', () => {
    const custom = normalizeLicense('Licença Proprietária Interna');
    expect(custom).toBe('Licença Proprietária Interna');
    expect(isKnownLicense(custom)).toBe(false);
    expect(requiresAttributionNotice(custom)).toBe(false);
  });

  it('classifica copyleft apenas para as licenças recíprocas', () => {
    expect(isCopyleft('GPL-3.0')).toBe(true);
    expect(isCopyleft('AGPL-3.0')).toBe(true);
    expect(isCopyleft('MPL-2.0')).toBe(true);
    expect(isCopyleft('MIT')).toBe(false);
    expect(isCopyleft('CC0-1.0')).toBe(false);
    expect(isCopyleft(null)).toBe(false);
  });
});

describe('safeSourceUrl — nenhuma URL hostil escapa', () => {
  for (const input of URL_INPUTS) {
    it(`avalia com segurança ${JSON.stringify(String(input).slice(0, 48))}`, () => {
      const out = safeSourceUrl(input);
      if (out === null) return;
      expect(out.startsWith('https://')).toBe(true);
      expect(out).not.toContain('@');
      expect(/\s/.test(out)).toBe(false);
      // Idempotência: reprocessar uma URL segura devolve a mesma URL.
      expect(safeSourceUrl(out)).toBe(out);
    });
  }

  it('bloqueia esquemas perigosos', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'http://github.com/o/r',
    ]) {
      expect(safeSourceUrl(hostile)).toBeNull();
    }
  });

  it('bloqueia credenciais embutidas para não vazar token', () => {
    expect(safeSourceUrl('https://user:senha@github.com/o/r')).toBeNull();
    expect(safeSourceUrl('https://:token@github.com/o/r')).toBeNull();
  });

  it('bloqueia hosts sem ponto e URLs absurdamente longas', () => {
    expect(safeSourceUrl('https://localhost/o/r')).toBeNull();
    expect(safeSourceUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('repoLabelFromUrl', () => {
  it('extrai owner/repo e remove .git', () => {
    expect(repoLabelFromUrl('https://github.com/addyosmani/agent-skills')).toBe(
      'addyosmani/agent-skills',
    );
    expect(repoLabelFromUrl('https://github.com/smixs/agent-second-brain.git')).toBe(
      'smixs/agent-second-brain',
    );
    expect(repoLabelFromUrl('https://github.com/obra/superpowers/tree/main/skills')).toBe(
      'obra/superpowers',
    );
  });

  it('cai para o hostname quando não há owner/repo', () => {
    expect(repoLabelFromUrl('https://example.com/')).toBe('example.com');
    expect(repoLabelFromUrl('https://www.example.com/docs')).toBe('example.com');
  });

  it('devolve nulo para entrada inválida', () => {
    expect(repoLabelFromUrl(null)).toBeNull();
    expect(repoLabelFromUrl('não é url')).toBeNull();
  });
});

describe('buildSkillAttribution — produto cartesiano de cenários', () => {
  const scenarios = LICENSE_INPUTS.flatMap((license) =>
    URL_INPUTS.flatMap((url) =>
      REPO_INPUTS.map((repo) => ({
        source_license: license ?? null,
        source_url: url ?? null,
        source_repo: repo ?? null,
        author: 'Nexus',
      })),
    ),
  );

  it(`cobre ${scenarios.length} combinações sem violar invariantes`, () => {
    expect(scenarios.length).toBeGreaterThan(500);

    for (const scenario of scenarios) {
      const attribution = buildSkillAttribution(scenario);

      // 1. Nunca produz href inseguro.
      if (attribution.url !== null) {
        expect(attribution.url.startsWith('https://')).toBe(true);
        expect(attribution.url).not.toContain('@');
      }

      // 2. Rótulo saneado e limitado.
      if (attribution.label !== null) {
        expect(attribution.label.length).toBeGreaterThan(0);
        expect(attribution.label.length).toBeLessThanOrEqual(80);
        expect(attribution.label).toBe(attribution.label.trim());
      }

      // 3. Coerência de flags de licença.
      expect(attribution.licenseKnown).toBe(isKnownLicense(attribution.license));
      if (attribution.license === null) {
        expect(attribution.requiresNotice).toBe(false);
        expect(attribution.copyleft).toBe(false);
      }
      if (attribution.copyleft) {
        expect(attribution.licenseKnown).toBe(true);
      }

      // 4. Nativa ⇔ sem rótulo e sem licença ⇔ sem texto de aviso.
      expect(attribution.isNative).toBe(
        attribution.label === null && attribution.license === null,
      );
      expect(attribution.noticeText === null).toBe(attribution.isNative);

      // 5. Texto de aviso sempre cita o que existe.
      if (attribution.noticeText) {
        if (attribution.label) expect(attribution.noticeText).toContain(attribution.label);
        if (attribution.license) expect(attribution.noticeText).toContain(attribution.license);
      }

      // 6. Determinismo.
      expect(buildSkillAttribution(scenario)).toEqual(attribution);
    }
  });

  it('skill nativa do Nexus não exibe atribuição externa', () => {
    const attribution = buildSkillAttribution({
      author: 'Nexus',
      source_repo: null,
      source_url: null,
      source_license: null,
    });
    expect(attribution.isNative).toBe(true);
    expect(attribution.noticeText).toBeNull();
    expect(attribution.label).toBeNull();
  });

  it('URL hostil não contamina o rótulo quando o repo é confiável', () => {
    const attribution = buildSkillAttribution({
      source_repo: 'addyosmani/agent-skills',
      source_url: 'javascript:alert(1)',
      source_license: 'mit',
    });
    expect(attribution.url).toBeNull();
    expect(attribution.label).toBe('addyosmani/agent-skills');
    expect(attribution.license).toBe('MIT');
    expect(attribution.requiresNotice).toBe(true);
  });

  it('deriva o rótulo da URL quando não há repo informado', () => {
    const attribution = buildSkillAttribution({
      source_repo: '   ',
      source_url: 'https://github.com/obra/superpowers',
      source_license: 'Apache License 2.0',
    });
    expect(attribution.label).toBe('obra/superpowers');
    expect(attribution.license).toBe('Apache-2.0');
    expect(attribution.noticeText).toBe('Portado de obra/superpowers sob licença Apache-2.0.');
  });
});
