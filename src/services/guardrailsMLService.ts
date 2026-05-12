/**
 * Nexus — Guardrails ML Service
 * Connects to guardrails-ml edge function v2.2
 */
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

export interface GuardrailResult {
  passed: boolean;
  layer: string;
  score: number;
  details: string;
}

export interface GuardrailResponse {
  allowed: boolean;
  direction: 'input' | 'output';
  results: GuardrailResult[];
  blocked_count: number;
  version: string;
  request_id?: string;
  latency_ms?: number;
  score_average?: number;
}

export async function checkInput(text: string, agent_id?: string, mode: string = 'Council'): Promise<GuardrailResponse> {
  const { data, error } = await supabase.functions.invoke('guardrails-ml', {
    body: { text, direction: 'input', agent_id, mode },
  });
  if (error) {
    logger.error('Guardrails ML input check failed', { error: error.message });
    throw new Error(`Guardrails error: ${error.message}`);
  }
  return data as GuardrailResponse;
}

export async function checkOutput(text: string, agent_id?: string, mode: string = 'Council'): Promise<GuardrailResponse> {
  const { data, error } = await supabase.functions.invoke('guardrails-ml', {
    body: { text, direction: 'output', agent_id, mode },
  });
  if (error) {
    logger.error('Guardrails ML output check failed', { error: error.message });
    throw new Error(`Guardrails error: ${error.message}`);
  }
  return data as GuardrailResponse;
}

export async function isTextSafe(text: string, direction: 'input' | 'output' = 'input'): Promise<boolean> {
  const result = direction === 'input' ? await checkInput(text) : await checkOutput(text);
  return result.allowed;
}
