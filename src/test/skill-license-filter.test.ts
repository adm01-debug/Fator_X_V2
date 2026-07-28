/**
 * Simulação massiva do filtro de licença do marketplace.
 *
 * Invariante central: os modos `native`, `permissive`, `copyleft` e
 * `unlicensed` formam uma **partição** do catálogo — toda skill cai em
 * exatamente um deles. Se essa propriedade quebrar, algum item some da UI
 * (ou aparece duas vezes) dependendo do filtro escolhido.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillAttribution,
  filterSkillsByLicense,
  isLicenseFilter,
  KNOWN_LICENSES,
  LICENSE_FILTERS,
  matchesLicenseFilter,
  type LicenseFilter,
  type SkillAttributionSource,
} from '@/lib/skills/attribution';

const LICENSES: Array<string | null> = [
  ...KNOWN_LICENSES,
  'mit',
  'Apache License 2.0',
  'GPLv3',
  'cc0',
  'Licença Proprietária',
  'NOASSERTION',
  '',
  '   ',
  null,
];

const URLS: Array<string | null> = [
  'https://github.com/addyosmani/agent-skills',
  'https://github.com/obra/superpowers',
  'https://gitlab.com/g/p',
  'http://inseguro.com/x',
  'javascript:alert(1)',
  '',
  null,
];

const REPOS: Array<string | null> = ['addyosmani/agent-skills', 'obra/superpowers', '', null];

const CATALOG: SkillAttributionSource[] = LICENSES.flatMap((source_license) =>
  URLS.flatMap((source_url) =>
    REPOS.map((source_repo) => ({
      author: 'Nexus',
      source_license,
      source_url,
      source_repo,
    })),
  ),
);

const EXCLUSIVE_MODES: LicenseFilter[] = ['native', 'permissive', 'copyleft', 'unlicensed'];

describe('isLicenseFilter', () => {
  it('aceita apenas os modos declarados', () => {
    for (const { value } of LICENSE_FILTERS) expect(isLicenseFilter(value)).toBe(true);
    for (const bogus of ['', 'MIT', 'todos', null, undefined, 42, {}]) {
      expect(isLicenseFilter(bogus)).toBe(false);
    }
  });

  it('cada modo tem rótulo e dica em PT-BR', () => {
    for (const filter of LICENSE_FILTERS) {
      expect(filter.label.length).toBeGreaterThan(2);
      expect(filter.hint.length).toBeGreaterThan(10);
    }
  });
});

describe('matchesLicenseFilter — partição do catálogo', () => {
  it(`classifica ${CATALOG.length} skills sintéticas em exatamente um modo`, () => {
    expect(CATALOG.length).toBeGreaterThan(300);

    for (const skill of CATALOG) {
      const hits = EXCLUSIVE_MODES.filter((mode) => matchesLicenseFilter(skill, mode));
      expect(hits).toHaveLength(1);

      // `all` sempre aceita.
      expect(matchesLicenseFilter(skill, 'all')).toBe(true);

      // Coerência com a atribuição derivada.
      const attribution = buildSkillAttribution(skill);
      if (hits[0] === 'copyleft') expect(attribution.copyleft).toBe(true);
      if (hits[0] === 'native') expect(attribution.isNative).toBe(true);
      if (hits[0] === 'unlicensed') expect(attribution.license).toBeNull();
      if (hits[0] === 'permissive') expect(attribution.licenseKnown).toBe(true);
    }
  });

  it('nunca presume permissiva para licença desconhecida', () => {
    const skill = { source_repo: 'a/b', source_license: 'Licença Proprietária' };
    expect(matchesLicenseFilter(skill, 'permissive')).toBe(false);
    expect(matchesLicenseFilter(skill, 'copyleft')).toBe(false);
    expect(matchesLicenseFilter(skill, 'unlicensed')).toBe(false);
    expect(matchesLicenseFilter(skill, 'native')).toBe(false);
    // Item legítimo do catálogo: continua visível em "Todas".
    expect(matchesLicenseFilter(skill, 'all')).toBe(true);
  });

  it('degrada para "todas" quando o filtro é inválido ou corrompido', () => {
    for (const bogus of ['', 'lixo', 'MIT', 'undefined']) {
      expect(filterSkillsByLicense(CATALOG, bogus)).toHaveLength(CATALOG.length);
    }
  });
});

describe('filterSkillsByLicense', () => {
  it('preserva a ordem original e não muta a entrada', () => {
    const original = [...CATALOG];
    const out = filterSkillsByLicense(CATALOG, 'permissive');
    expect(CATALOG).toEqual(original);

    const indices = out.map((s) => CATALOG.indexOf(s));
    const sorted = [...indices].sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
  });

  it('a união dos modos exclusivos reconstrói o catálogo sem sobra', () => {
    const total = EXCLUSIVE_MODES.reduce(
      (sum, mode) => sum + filterSkillsByLicense(CATALOG, mode).length,
      0,
    );
    expect(total).toBe(CATALOG.length);
  });

  it('cenário real: catálogo do Nexus', () => {
    const real: SkillAttributionSource[] = [
      { author: 'Nexus', source_license: null, source_repo: null, source_url: null },
      {
        author: 'Nexus',
        source_license: 'MIT',
        source_repo: 'addyosmani/agent-skills',
        source_url: 'https://github.com/addyosmani/agent-skills',
      },
      {
        author: 'Nexus',
        source_license: 'MIT',
        source_repo: 'obra/superpowers',
        source_url: 'https://github.com/obra/superpowers',
      },
      { author: 'Terceiro', source_license: 'AGPL-3.0', source_repo: 'x/y', source_url: null },
      { author: 'Terceiro', source_license: null, source_repo: 'z/w', source_url: null },
    ];

    expect(filterSkillsByLicense(real, 'native')).toHaveLength(1);
    expect(filterSkillsByLicense(real, 'permissive')).toHaveLength(2);
    expect(filterSkillsByLicense(real, 'copyleft')).toHaveLength(1);
    expect(filterSkillsByLicense(real, 'unlicensed')).toHaveLength(1);
    expect(filterSkillsByLicense(real, 'all')).toHaveLength(5);
  });
});
