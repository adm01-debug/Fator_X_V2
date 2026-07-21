// Lovable AI Gateway Provider

import type { LLMCallParams, LLMResult } from "../types.ts";
import { normalizeOpenAIResponse } from "../utils.ts";
import { fetchWithTimeout, withRetry } from "../../_shared/retry.ts";

function mapToLovableModel(model: string): string {
  const clean = model.replace(/^(huggingface|openai|anthropic|google)\//, '');
  if (clean.includes('gemini-2.5-flash')) return 'google/gemini-2.5-flash';
  if (clean.includes('gemini-2.5-pro')) return 'google/gemini-2.5-pro';
  if (clean.includes('gemini-3')) return 'google/gemini-3-flash-preview';
  if (clean.includes('gpt-5')) return 'openai/gpt-5';
  if (clean.includes('gpt-4o')) return 'openai/gpt-5-mini';
  return 'google/gemini-2.5-flash';
}

export async function callLovable(
  params: LLMCallParams,
  apiKey: string,
): Promise<LLMResult> {
  const lovableModel = mapToLovableModel(params.model);
  const response = await withRetry(() => fetchWithTimeout('https://api.lovable.dev/v1/chat/completions', {
    method: 'POST',
    timeoutMs: 60_000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: lovableModel,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
    }),
  }), { attempts: 3, baseMs: 300 });
  const result = await response.json();
  return normalizeOpenAIResponse(result);
}
