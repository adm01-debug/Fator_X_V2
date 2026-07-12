import { z } from 'zod';

export const RAIL_IDS = ['prompt_injection', 'pii_detection', 'toxicity', 'secret_leakage'] as const;
export const RAIL_LAYERS = ['input', 'output'] as const;
export const RAIL_ACTIONS = ['block', 'warn', 'log_only'] as const;

export const guardrailRuleSchema = z.object({
  rail: z.enum(RAIL_IDS),
  layer: z.enum(RAIL_LAYERS),
  enabled: z.boolean(),
  threshold: z.number().min(0).max(1),
  action: z.enum(RAIL_ACTIONS),
});

export const guardrailPolicyConfigSchema = z.object({
  agent_id: z.string().uuid(),
  rules: z.array(guardrailRuleSchema).min(1),
});

export type GuardrailRule = z.infer<typeof guardrailRuleSchema>;
export type GuardrailPolicyConfig = z.infer<typeof guardrailPolicyConfigSchema>;

export const DEFAULT_RULES: GuardrailRule[] = [
  { rail: 'prompt_injection', layer: 'input', enabled: true, threshold: 0.7, action: 'block' },
  { rail: 'pii_detection', layer: 'output', enabled: true, threshold: 0.8, action: 'warn' },
  { rail: 'toxicity', layer: 'output', enabled: true, threshold: 0.75, action: 'block' },
  { rail: 'secret_leakage', layer: 'output', enabled: true, threshold: 0.9, action: 'block' },
];

export const RAIL_META: Record<(typeof RAIL_IDS)[number], { name: string; icon: string; description: string }> = {
  prompt_injection: { name: 'Prompt Injection', icon: '🛡️', description: 'Detecta manipulação do prompt do sistema' },
  pii_detection: { name: 'Detecção de PII', icon: '🔒', description: 'Identifica CPF, CNPJ, emails, telefones, cartões' },
  toxicity: { name: 'Toxicidade', icon: '⚠️', description: 'Detecta linguagem ofensiva ou inapropriada' },
  secret_leakage: { name: 'Vazamento de Secrets', icon: '🔑', description: 'Bloqueia API keys, tokens e senhas' },
};
