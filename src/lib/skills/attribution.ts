/**
 * Atribuição de origem/licença das skills do marketplace.
 *
 * Motivação: parte do catálogo é portada de repositórios de terceiros
 * (MIT, Apache-2.0, CC0…). Exibir a licença e a fonte não é enfeite: as
 * licenças permissivas exigem *preservação do aviso de atribuição* ao
 * redistribuir. Este módulo é puro (sem I/O) para poder ser exercitado por
 * simulação massiva de cenários.
 *
 * Regras de segurança aplicadas ao link de origem:
 *  - somente `https:` (bloqueia `javascript:`, `data:`, `file:`, `http:`);
 *  - sem credenciais embutidas (`https://user:pass@host`) — vazamento de segredo;
 *  - host precisa existir e não pode conter espaços/caracteres de controle.
 */

/** Identificadores SPDX que o sistema reconhece explicitamente. */
export const KNOWN_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-3.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'Unlicense',
] as const;

export type KnownLicense = (typeof KNOWN_LICENSES)[number];

/** Sinônimos comuns encontrados em `package.json`/README de repositórios. */
const LICENSE_ALIASES: Record<string, KnownLicense> = {
  mit: 'MIT',
  'mit license': 'MIT',
  'the mit license': 'MIT',
  'expat': 'MIT',
  apache: 'Apache-2.0',
  'apache 2': 'Apache-2.0',
  'apache 2.0': 'Apache-2.0',
  'apache-2': 'Apache-2.0',
  'apache-2.0': 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0',
  asl2: 'Apache-2.0',
  bsd: 'BSD-3-Clause',
  'bsd-2': 'BSD-2-Clause',
  'bsd 2-clause': 'BSD-2-Clause',
  'bsd-2-clause': 'BSD-2-Clause',
  'bsd-3': 'BSD-3-Clause',
  'bsd 3-clause': 'BSD-3-Clause',
  'bsd-3-clause': 'BSD-3-Clause',
  isc: 'ISC',
  mpl: 'MPL-2.0',
  'mpl-2.0': 'MPL-2.0',
  'mozilla public license 2.0': 'MPL-2.0',
  gpl: 'GPL-3.0',
  'gpl-3.0': 'GPL-3.0',
  gplv3: 'GPL-3.0',
  agpl: 'AGPL-3.0',
  'agpl-3.0': 'AGPL-3.0',
  lgpl: 'LGPL-3.0',
  'lgpl-3.0': 'LGPL-3.0',
  cc0: 'CC0-1.0',
  'cc0-1.0': 'CC0-1.0',
  'public domain': 'CC0-1.0',
  'cc-by-4.0': 'CC-BY-4.0',
  'cc by 4.0': 'CC-BY-4.0',
  'cc-by-sa-4.0': 'CC-BY-SA-4.0',
  unlicense: 'Unlicense',
  'the unlicense': 'Unlicense',
};

/**
 * Licenças que impõem obrigações ao redistribuidor (aviso de copyright,
 * cópia da licença ou reciprocidade). Usado para destacar o selo na UI.
 */
const LICENSES_WITH_NOTICE = new Set<string>([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
]);

/** Licenças copyleft — merecem destaque de risco na curadoria. */
const COPYLEFT = new Set<string>(['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'MPL-2.0', 'CC-BY-SA-4.0']);

/**
 * Normaliza um texto livre de licença para um identificador SPDX conhecido.
 * Retorna `null` quando não há licença informada; devolve o texto saneado
 * (truncado) quando é desconhecida, para não perder informação da curadoria.
 */
export function normalizeLicense(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  // Remove caracteres de controle antes de qualquer decisão.
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (cleaned.length === 0) return null;

  const key = cleaned.toLowerCase().replace(/\s+/g, ' ');
  const exact = KNOWN_LICENSES.find((l) => l.toLowerCase() === key);
  if (exact) return exact;

  const alias = LICENSE_ALIASES[key];
  if (alias) return alias;

  // Variantes com sufixo "license"/"licence" ao final: "ISC License".
  const stripped = key.replace(/\s+licen[cs]e$/, '');
  const strippedExact = KNOWN_LICENSES.find((l) => l.toLowerCase() === stripped);
  if (strippedExact) return strippedExact;
  if (LICENSE_ALIASES[stripped]) return LICENSE_ALIASES[stripped];

  if (key === 'noassertion' || key === 'unknown' || key === 'none' || key === 'null') return null;

  return cleaned.slice(0, 60);
}

/** `true` quando a licença é um SPDX que o sistema reconhece. */
export function isKnownLicense(license: string | null): license is KnownLicense {
  return license !== null && (KNOWN_LICENSES as readonly string[]).includes(license);
}

/** `true` quando a redistribuição exige preservar aviso de atribuição. */
export function requiresAttributionNotice(license: string | null): boolean {
  return license !== null && LICENSES_WITH_NOTICE.has(license);
}

/** `true` para licenças copyleft (reciprocidade). */
export function isCopyleft(license: string | null): boolean {
  return license !== null && COPYLEFT.has(license);
}

/**
 * Valida e devolve uma URL de origem segura para ser usada em `href`.
 * Retorna `null` para qualquer entrada não confiável.
 */
export function safeSourceUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;
  // Espaços internos ou caracteres de controle indicam entrada malformada.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username.length > 0 || url.password.length > 0) return null;
  if (url.hostname.length === 0 || !url.hostname.includes('.')) return null;

  return url.toString();
}

/**
 * Extrai `owner/repo` de uma URL de repositório (GitHub/GitLab).
 * Cai para o hostname quando o caminho não tem os dois segmentos.
 */
export function repoLabelFromUrl(url: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    return `${segments[0]}/${segments[1].replace(/\.git$/, '')}`;
  }
  return parsed.hostname.replace(/^www\./, '');
}

export interface SkillAttributionSource {
  author?: string | null;
  source_repo?: string | null;
  source_url?: string | null;
  source_license?: string | null;
}

export interface SkillAttribution {
  /** Licença normalizada (SPDX quando reconhecida) ou `null`. */
  license: string | null;
  /** Licença é um SPDX conhecido. */
  licenseKnown: boolean;
  /** Redistribuição exige preservar o aviso de atribuição. */
  requiresNotice: boolean;
  /** Licença copyleft. */
  copyleft: boolean;
  /** URL segura (https, sem credenciais) ou `null`. */
  url: string | null;
  /** Rótulo curto da origem: `owner/repo`, hostname ou o autor. */
  label: string | null;
  /** Skill nativa do Nexus (sem origem externa). */
  isNative: boolean;
  /** Texto pronto para tooltip/aria-label. */
  noticeText: string | null;
}

/**
 * Constrói o bloco de atribuição de uma skill a partir das colunas de origem.
 * Função pura: mesma entrada ⇒ mesma saída, sem acesso a rede ou storage.
 */
export function buildSkillAttribution(skill: SkillAttributionSource): SkillAttribution {
  const license = normalizeLicense(skill.source_license);
  const url = safeSourceUrl(skill.source_url);
  const repoRaw = typeof skill.source_repo === 'string' ? skill.source_repo.trim() : '';
  const repoFromUrl = repoLabelFromUrl(url);
  const label = repoRaw.length > 0 ? repoRaw.slice(0, 80) : repoFromUrl;

  const isNative = label === null && license === null;

  const licenseKnown = isKnownLicense(license);
  const requiresNotice = requiresAttributionNotice(license);

  let noticeText: string | null = null;
  if (label && license) {
    noticeText = `Portado de ${label} sob licença ${license}.`;
  } else if (label) {
    noticeText = `Portado de ${label}. Licença não informada.`;
  } else if (license) {
    noticeText = `Distribuído sob licença ${license}.`;
  }

  return {
    license,
    licenseKnown,
    requiresNotice,
    copyleft: isCopyleft(license),
    url,
    label,
    isNative,
    noticeText,
  };
}

// ---------------------------------------------------------------------------
// Filtro de licença do marketplace
// ---------------------------------------------------------------------------

/**
 * Modos de filtro por licença.
 *
 * Motivação de produto: em contexto comercial, incorporar uma skill copyleft
 * (GPL/AGPL/MPL/CC-BY-SA) ao produto pode obrigar a abrir o derivado. O filtro
 * permite ao curador esconder esses casos sem apagá-los do catálogo, e também
 * isolar as skills sem licença declarada — o pior cenário jurídico, porque
 * "sem licença" significa *todos os direitos reservados*, não domínio público.
 */
export type LicenseFilter =
  | 'all'
  | 'native'
  | 'permissive'
  | 'copyleft'
  | 'unlicensed';

export const LICENSE_FILTERS: ReadonlyArray<{
  value: LicenseFilter;
  label: string;
  hint: string;
}> = [
  { value: 'all', label: 'Todas as licenças', hint: 'Sem filtro de licença.' },
  {
    value: 'native',
    label: 'Nativas do Nexus',
    hint: 'Skills criadas internamente, sem origem externa.',
  },
  {
    value: 'permissive',
    label: 'Permissivas',
    hint: 'MIT, Apache-2.0, BSD, ISC, CC0 — uso comercial sem reciprocidade.',
  },
  {
    value: 'copyleft',
    label: 'Copyleft',
    hint: 'GPL, AGPL, LGPL, MPL, CC-BY-SA — exigem reciprocidade no derivado.',
  },
  {
    value: 'unlicensed',
    label: 'Sem licença declarada',
    hint: 'Origem externa sem licença: risco jurídico, revisar antes de usar.',
  },
] as const;

/** `true` quando o valor é um modo de filtro válido. */
export function isLicenseFilter(value: unknown): value is LicenseFilter {
  return (
    typeof value === 'string' &&
    LICENSE_FILTERS.some((f) => f.value === value)
  );
}

/**
 * Decide se uma skill passa pelo filtro de licença escolhido.
 * Pura e total: qualquer valor de filtro desconhecido é tratado como `all`,
 * de modo que a UI nunca "some" com o catálogo por causa de estado corrompido.
 */
export function matchesLicenseFilter(
  skill: SkillAttributionSource,
  filter: LicenseFilter | string,
): boolean {
  if (!isLicenseFilter(filter) || filter === 'all') return true;

  const attribution = buildSkillAttribution(skill);

  switch (filter) {
    case 'native':
      return attribution.isNative;
    case 'copyleft':
      return attribution.copyleft;
    case 'permissive':
      // Permissiva = SPDX conhecido e não recíproco. Licença desconhecida
      // (texto livre) nunca é presumida permissiva.
      return attribution.licenseKnown && !attribution.copyleft;
    case 'unlicensed':
      // Origem externa (tem rótulo) porém sem licença normalizada.
      return !attribution.isNative && attribution.license === null;
    default:
      return true;
  }
}

/** Aplica {@link matchesLicenseFilter} a uma lista preservando a ordem. */
export function filterSkillsByLicense<T extends SkillAttributionSource>(
  skills: readonly T[],
  filter: LicenseFilter | string,
): T[] {
  return skills.filter((skill) => matchesLicenseFilter(skill, filter));
}
