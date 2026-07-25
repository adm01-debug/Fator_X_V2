/**
 * Modelo de dados do Skill Composer visual.
 * O usuário monta a skill via UI; este modelo é serializado para skill_config JSON.
 */
import { z } from 'zod';

// --------- Inputs ---------
export const inputTypeSchema = z.enum(['string', 'number', 'boolean', 'enum', 'json']);
export type SkillInputType = z.infer<typeof inputTypeSchema>;

export const skillInputSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(40, 'Máx 40 caracteres')
    .regex(/^[a-z][a-z0-9_]*$/i, 'Somente letras, dígitos e "_"; comece com letra'),
  type: inputTypeSchema,
  required: z.boolean(),
  description: z.string().trim().max(200, 'Máx 200 caracteres').default(''),
  defaultValue: z.string().trim().max(200).optional().default(''),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().trim().max(200).optional().default(''),
    enumValues: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  }).default({ pattern: '', enumValues: [] }),
});
export type SkillInput = z.infer<typeof skillInputSchema>;

// --------- Outputs ---------
export const skillOutputSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(40, 'Máx 40 caracteres')
    .regex(/^[a-z][a-z0-9_]*$/i, 'Somente letras, dígitos e "_"; comece com letra'),
  type: inputTypeSchema,
  description: z.string().trim().max(200).default(''),
});
export type SkillOutput = z.infer<typeof skillOutputSchema>;

// --------- Prompt ---------
export const skillPromptSchema = z.object({
  systemMessage: z.string().trim().max(2000).default(''),
  template: z.string().trim().max(4000).default(''),
});
export type SkillPrompt = z.infer<typeof skillPromptSchema>;

// --------- Execution (por categoria) ---------
export const executionKindSchema = z.enum([
  'http',
  'llm',
  'workflow',
  'rag',
  'integration',
]);
export type SkillExecutionKind = z.infer<typeof executionKindSchema>;

export const httpHeaderSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().max(200),
});

export const workflowStepSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  action: z.enum(['transform', 'http_call', 'llm_call', 'delay', 'notify']),
  params: z.string().trim().max(500).default(''),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const skillExecutionSchema = z.object({
  kind: executionKindSchema,
  http: z.object({
    url: z.string().trim().max(500).default(''),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
    headers: z.array(httpHeaderSchema).max(20).default([]),
    bodyTemplate: z.string().trim().max(2000).default(''),
  }).default({ url: '', method: 'POST', headers: [], bodyTemplate: '' }),
  llm: z.object({
    provider: z.enum(['lovable-ai', 'openai', 'anthropic', 'google']).default('lovable-ai'),
    model: z.string().trim().max(80).default('google/gemini-2.5-flash'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().min(1).max(32000).default(2000),
  }).default({ provider: 'lovable-ai', model: 'google/gemini-2.5-flash', temperature: 0.7, maxTokens: 2000 }),
  workflow: z.object({
    steps: z.array(workflowStepSchema).max(20).default([]),
  }).default({ steps: [] }),
  rag: z.object({
    collection: z.string().trim().max(120).default(''),
    topK: z.number().int().min(1).max(50).default(5),
    minScore: z.number().min(0).max(1).default(0.6),
  }).default({ collection: '', topK: 5, minScore: 0.6 }),
  integration: z.object({
    provider: z.string().trim().max(60).default('slack'),
    event: z.string().trim().max(60).default('message'),
    authType: z.enum(['oauth2', 'apikey', 'basic']).default('oauth2'),
  }).default({ provider: 'slack', event: 'message', authType: 'oauth2' }),
});
export type SkillExecution = z.infer<typeof skillExecutionSchema>;

// --------- Draft raiz ---------
export const skillCategorySchema = z.enum([
  'tools',
  'knowledge',
  'prompts',
  'workflows',
  'integrations',
]);

export const skillDraftSchema = z.object({
  name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Apenas minúsculas, números e hífen'),
  description: z.string().trim().min(20, 'Mínimo 20 caracteres').max(500, 'Máximo 500 caracteres'),
  category: skillCategorySchema,
  version: z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Formato: X.Y.Z (ex: 1.0.0)'),
  tags: z.array(z.string().trim().min(1).max(24)).max(8, 'Máximo 8 tags'),
  inputs: z.array(skillInputSchema).max(20, 'Máximo 20 inputs'),
  outputs: z.array(skillOutputSchema).max(20, 'Máximo 20 outputs'),
  prompt: skillPromptSchema,
  execution: skillExecutionSchema,
});
export type SkillDraft = z.infer<typeof skillDraftSchema>;

// Mapa: categoria da skill → tipo de execução padrão
export const CATEGORY_TO_EXECUTION_KIND: Record<
  z.infer<typeof skillCategorySchema>,
  SkillExecutionKind
> = {
  tools: 'http',
  knowledge: 'rag',
  prompts: 'llm',
  workflows: 'workflow',
  integrations: 'integration',
};

/**
 * Serializa o draft visual em `skill_config` (formato armazenado no registry).
 * Apenas a seção de execução ativa é incluída, evitando ruído.
 */
export function draftToSkillConfig(draft: SkillDraft): Record<string, unknown> {
  const activeExecution: Record<string, unknown> = { kind: draft.execution.kind };
  activeExecution[draft.execution.kind] = draft.execution[draft.execution.kind];

  return {
    inputs: draft.inputs.map((i) => ({
      name: i.name,
      type: i.type,
      required: i.required,
      description: i.description,
      default: i.defaultValue || undefined,
      validation: {
        min: i.validation.min,
        max: i.validation.max,
        pattern: i.validation.pattern || undefined,
        enum: i.validation.enumValues.length > 0 ? i.validation.enumValues : undefined,
      },
    })),
    outputs: draft.outputs.map((o) => ({
      name: o.name,
      type: o.type,
      description: o.description,
    })),
    prompt: {
      system: draft.prompt.systemMessage || undefined,
      template: draft.prompt.template || undefined,
    },
    execution: activeExecution,
  };
}

export const DEFAULT_DRAFT: SkillDraft = {
  name: '',
  slug: '',
  description: '',
  category: 'tools',
  version: '1.0.0',
  tags: [],
  inputs: [],
  outputs: [],
  prompt: { systemMessage: '', template: '' },
  execution: {
    kind: 'http',
    http: { url: '', method: 'POST', headers: [], bodyTemplate: '' },
    llm: { provider: 'lovable-ai', model: 'google/gemini-2.5-flash', temperature: 0.7, maxTokens: 2000 },
    workflow: { steps: [] },
    rag: { collection: '', topK: 5, minScore: 0.6 },
    integration: { provider: 'slack', event: 'message', authType: 'oauth2' },
  },
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
