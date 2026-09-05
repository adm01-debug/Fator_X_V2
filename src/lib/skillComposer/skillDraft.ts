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
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().trim().max(200).optional().default(''),
      enumValues: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    })
    .default({ pattern: '', enumValues: [] }),
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
export const executionKindSchema = z.enum(['http', 'llm', 'workflow', 'rag', 'integration']);
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
  http: z
    .object({
      url: z.string().trim().max(500).default(''),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
      headers: z.array(httpHeaderSchema).max(20).default([]),
      bodyTemplate: z.string().trim().max(2000).default(''),
    })
    .default({ url: '', method: 'POST', headers: [], bodyTemplate: '' }),
  llm: z
    .object({
      provider: z.enum(['lovable-ai', 'openai', 'anthropic', 'google']).default('lovable-ai'),
      model: z.string().trim().max(80).default('google/gemini-2.5-flash'),
      temperature: z.number().min(0).max(2).default(0.7),
      maxTokens: z.number().int().min(1).max(32000).default(2000),
    })
    .default({
      provider: 'lovable-ai',
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 2000,
    }),
  workflow: z
    .object({
      steps: z.array(workflowStepSchema).max(20).default([]),
    })
    .default({ steps: [] }),
  rag: z
    .object({
      collection: z.string().trim().max(120).default(''),
      topK: z.number().int().min(1).max(50).default(5),
      minScore: z.number().min(0).max(1).default(0.6),
    })
    .default({ collection: '', topK: 5, minScore: 0.6 }),
  integration: z
    .object({
      provider: z.string().trim().max(60).default('slack'),
      event: z.string().trim().max(60).default('message'),
      authType: z.enum(['oauth2', 'apikey', 'basic']).default('oauth2'),
    })
    .default({ provider: 'slack', event: 'message', authType: 'oauth2' }),
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

const skillDraftBaseSchema = z.object({
  name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Apenas minúsculas, números e hífen'),
  description: z.string().trim().min(20, 'Mínimo 20 caracteres').max(500, 'Máximo 500 caracteres'),
  category: skillCategorySchema,
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'Formato: X.Y.Z (ex: 1.0.0)'),
  tags: z.array(z.string().trim().min(1).max(24)).max(8, 'Máximo 8 tags'),
  inputs: z.array(skillInputSchema).max(20, 'Máximo 20 inputs'),
  outputs: z.array(skillOutputSchema).max(20, 'Máximo 20 outputs'),
  prompt: skillPromptSchema,
  execution: skillExecutionSchema,
});

/** Extrai placeholders `{{nome}}` de um template. */
export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) found.add(match[1]);
  return Array.from(found);
}

/** Heurística de segredo literal (tokens tipo sk-live-..., ghp_..., JWTs, chaves longas). */
export function looksLikeHardcodedSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\{\{.+\}\}/.test(v)) return false; // referência a variável — seguro
  if (/(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{12,}/i.test(v)) return true;
  if (/\b(ghp|gho|github_pat|xox[baprs]|AIza|ya29)[-_A-Za-z0-9]{10,}/.test(v)) return true;
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(v)) return true; // JWT
  if (/^Bearer\s+[A-Za-z0-9._-]{16,}$/i.test(v)) return true;
  return false;
}

function isExecutionSectionConfigured(
  execution: SkillExecution,
  kind: SkillExecutionKind,
): boolean {
  switch (kind) {
    case 'http':
      return execution.http.url.trim().length > 0 || execution.http.headers.length > 0;
    case 'rag':
      return execution.rag.collection.trim().length > 0;
    case 'workflow':
      return execution.workflow.steps.length > 0;
    case 'llm':
    case 'integration':
      return false; // possuem apenas defaults — nunca indicam configuração explícita
    default:
      return false;
  }
}

/**
 * Schema do draft com invariantes semânticas (cross-field) que o schema estrutural
 * sozinho não captura. Cada regra abaixo cobre um gap real detectado pela suíte
 * determinística `skillsSimulationService`.
 */
export const skillDraftSchema = skillDraftBaseSchema.superRefine((draft, ctx) => {
  // 1. Nomes de input/output únicos
  const seenInputs = new Set<string>();
  draft.inputs.forEach((input, index) => {
    const key = input.name.trim().toLowerCase();
    if (seenInputs.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', index, 'name'],
        message: `Nome de input duplicado: "${input.name}"`,
      });
    }
    seenInputs.add(key);
  });

  const seenOutputs = new Set<string>();
  draft.outputs.forEach((output, index) => {
    const key = output.name.trim().toLowerCase();
    if (seenOutputs.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputs', index, 'name'],
        message: `Nome de output duplicado: "${output.name}"`,
      });
    }
    seenOutputs.add(key);
  });

  // 2. Pelo menos um output declarado
  if (draft.outputs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputs'],
      message: 'Declare pelo menos um output',
    });
  }

  // 3. Validações por input: enum vazio, min > max, regex inválida
  draft.inputs.forEach((input, index) => {
    if (input.type === 'enum' && input.validation.enumValues.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', index, 'validation', 'enumValues'],
        message: 'Enum precisa de ao menos um valor',
      });
    }
    const { min, max, pattern } = input.validation;
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inputs', index, 'validation', 'min'],
        message: 'Valor mínimo não pode ser maior que o máximo',
      });
    }
    if (pattern) {
      try {
        new RegExp(pattern);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inputs', index, 'validation', 'pattern'],
          message: 'Expressão regular inválida',
        });
      }
    }
  });

  // 4. Placeholders do prompt precisam existir como inputs declarados
  const declared = new Set(draft.inputs.map((i) => i.name.trim().toLowerCase()));
  const templates = [
    draft.prompt.template,
    draft.prompt.systemMessage,
    draft.execution.http.bodyTemplate,
  ];
  const usedPlaceholders = new Set<string>();
  for (const tpl of templates) {
    for (const ph of extractPlaceholders(tpl)) {
      usedPlaceholders.add(ph.toLowerCase());
      if (!declared.has(ph.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prompt', 'template'],
          message: `Placeholder "{{${ph}}}" não está declarado nos inputs`,
        });
      }
    }
  }

  // 5. Em skills de prompt, todo input obrigatório precisa ser referenciado
  if (draft.category === 'prompts') {
    draft.inputs.forEach((input, index) => {
      if (input.required && !usedPlaceholders.has(input.name.trim().toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inputs', index, 'name'],
          message: `Input obrigatório "${input.name}" nunca é usado no prompt`,
        });
      }
    });
  }

  // 6. Coerência categoria × execução
  const canonical = CATEGORY_TO_EXECUTION_KIND[draft.category];
  const kind = draft.execution.kind;
  if (kind !== canonical) {
    // Um kind divergente só é aceito enquanto não estiver configurado (rascunho).
    if (isExecutionSectionConfigured(draft.execution, kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution', 'kind'],
        message: `Categoria "${draft.category}" espera execução "${canonical}", mas "${kind}" está configurada`,
      });
    }
    return;
  }

  // 7. Regras específicas do kind canônico
  if (kind === 'http') {
    const url = draft.execution.http.url.trim();
    if (!url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution', 'http', 'url'],
        message: 'URL obrigatória',
      });
    } else if (!/^https:\/\//i.test(url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution', 'http', 'url'],
        message: 'A URL precisa usar HTTPS',
      });
    }
    draft.execution.http.headers.forEach((header, index) => {
      if (looksLikeHardcodedSecret(header.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['execution', 'http', 'headers', index, 'value'],
          message: 'Segredo literal detectado — use uma variável (ex.: {{API_KEY}})',
        });
      }
    });
  }

  if (kind === 'rag' && !draft.execution.rag.collection.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['execution', 'rag', 'collection'],
      message: 'Selecione uma coleção de conhecimento',
    });
  }

  if (kind === 'llm' && !draft.prompt.template.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prompt', 'template'],
      message: 'Template de prompt obrigatório para execução LLM',
    });
  }

  if (kind === 'workflow' && draft.execution.workflow.steps.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['execution', 'workflow', 'steps'],
      message: 'Adicione ao menos um passo ao workflow',
    });
  }

  if (kind === 'integration') {
    if (!draft.execution.integration.provider.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution', 'integration', 'provider'],
        message: 'Provedor obrigatório',
      });
    }
    if (!draft.execution.integration.event.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['execution', 'integration', 'event'],
        message: 'Evento obrigatório',
      });
    }
  }
});
export type SkillDraft = z.infer<typeof skillDraftBaseSchema>;

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
    llm: {
      provider: 'lovable-ai',
      model: 'google/gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 2000,
    },
    workflow: { steps: [] },
    rag: { collection: '', topK: 5, minScore: 0.6 },
    integration: { provider: 'slack', event: 'message', authType: 'oauth2' },
  },
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
