/**
 * Zod schema para ResearchConfig — usado no ResearchSettingsDialog
 * para validação e coerção antes de persistir em localStorage.
 */
import { z } from 'zod';

export const researchConfigSchema = z.object({
  defaultDepth: z.enum(['quick', 'standard', 'deep']),
  maxIterations: z.coerce.number().int({ message: 'Deve ser inteiro' })
    .min(1, { message: 'Mínimo 1 iteração' })
    .max(10, { message: 'Máximo 10 iterações' }),
  queriesPerIteration: z.coerce.number().int({ message: 'Deve ser inteiro' })
    .min(1, { message: 'Mínimo 1 query' })
    .max(5, { message: 'Máximo 5 queries' }),
  strategy: z.enum(['broad', 'balanced', 'focused']),
  synthesisModel: z.enum(['claude-sonnet-4-6', 'claude-opus-4-8', 'gpt-5-large', 'gemini-2-5-pro']),
  language: z.enum(['pt', 'en', 'es']),
  includeInternal: z.boolean(),
  stopOnNoGaps: z.boolean(),
  maxTokens: z.coerce.number().int()
    .min(1000, { message: 'Mínimo 1.000 tokens' })
    .max(500_000, { message: 'Máximo 500.000 tokens' }),
  maxSources: z.coerce.number().int()
    .min(5, { message: 'Mínimo 5 fontes' })
    .max(50, { message: 'Máximo 50 fontes' }),
  maxLatencySec: z.coerce.number().int()
    .min(30, { message: 'Mínimo 30s' })
    .max(600, { message: 'Máximo 600s (10min)' }),
  maxCostUsd: z.coerce.number()
    .min(0.1, { message: 'Mínimo USD 0.10' })
    .max(50, { message: 'Máximo USD 50.00' }),
});

export type ResearchConfigInput = z.input<typeof researchConfigSchema>;
export type ResearchConfigParsed = z.output<typeof researchConfigSchema>;

export type FieldErrors = Partial<Record<keyof ResearchConfigParsed, string>>;

export function validateResearchConfig(
  draft: unknown,
): { success: true; data: ResearchConfigParsed } | { success: false; errors: FieldErrors } {
  const result = researchConfigSchema.safeParse(draft);
  if (result.success) return { success: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ResearchConfigParsed | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
}
