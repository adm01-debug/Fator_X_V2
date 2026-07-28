/**
 * Schema Zod canônico de skills importadas do GitHub.
 *
 * Usado tanto na promoção de candidatos para o `skill_registry` quanto
 * na validação de payloads vindos da Edge Function `skill-harvester`.
 */
import { z } from 'zod';
import { SKILL_DEPARTMENTS } from '@/config/skill-departments';

export const SKILL_CATEGORY_VALUES = [
  'tools',
  'knowledge',
  'prompts',
  'workflows',
  'integrations',
] as const;

export const HARVEST_STATUS_VALUES = [
  'pending',
  'accepted',
  'rejected',
  'promoted',
  'auto_rejected',
] as const;

const slugRegex = /^[a-z0-9][a-z0-9-]*$/;
const semverRegex = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export const skillImportSchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(slugRegex, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  description: z.string().trim().max(2000).default(''),
  version: z.string().trim().regex(semverRegex, 'Versão deve seguir semver').default('1.0.0'),
  author: z.string().trim().max(120).default(''),
  category: z.enum(SKILL_CATEGORY_VALUES),
  department: z.enum(SKILL_DEPARTMENTS).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  skill_config: z.record(z.unknown()).default({}),
  mcp_server_url: z
    .string()
    .url('URL de MCP inválida')
    .startsWith('https://', 'MCP deve usar HTTPS')
    .nullable()
    .default(null),
  source_repo: z.string().trim().min(3).max(200),
  source_url: z.string().url(),
  source_license: z.string().trim().max(60).nullable().default(null),
  source_commit: z.string().trim().max(64).nullable().default(null),
  quality_score: z.number().min(0).max(100).default(0),
});

export type SkillImport = z.infer<typeof skillImportSchema>;

/** `owner/repo` — mesma guarda aplicada na Edge Function. */
export const repoSlugRegex = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export const harvestRequestSchema = z.object({
  departments: z.array(z.enum(SKILL_DEPARTMENTS)).max(10).default([]),
  topics: z.array(z.string().trim().min(2).max(60)).max(20).default([]),
  extraQueries: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
  repos: z.array(z.string().trim().regex(repoSlugRegex, 'Use o formato owner/repo')).max(10).default([]),
  filesPerRepo: z.number().int().min(1).max(1000).default(8),
  /** Deslocamento na lista ordenada de SKILL.md — habilita varredura em lotes. */
  fileOffset: z.number().int().min(0).max(100000).default(0),

  maxRepos: z.number().int().min(1).max(200).default(40),
  maxCandidates: z.number().int().min(1).max(1000).default(120),
  minStars: z.number().int().min(0).max(100000).default(3),
  dryRun: z.boolean().default(false),
});


export type HarvestRequest = z.infer<typeof harvestRequestSchema>;

export const candidateReviewSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['approve', 'reject', 'reclassify']),
  department: z.enum(SKILL_DEPARTMENTS).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export type CandidateReview = z.infer<typeof candidateReviewSchema>;

/** Normaliza um texto arbitrário em um slug seguro. */
export function slugifySkill(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
