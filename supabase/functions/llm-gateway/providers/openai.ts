// OpenAI & Google (OpenAI-compatible) Provider

import type { LLMCallParams, LLMResult } from '../types.ts';
import { normalizeOpenAIResponse } from '../utils.ts';
import { fetchWithTimeout, withRetry } from '../../_shared/retry.ts';
import { AI_CHAT_COMPLETIONS_URL } from '../../_shared/ai-provider.ts';

export async function callOpenAICompatible(
  params: LLMCallParams,
  apiKey: string,
  provider: string,
): Promise<LLMResult> {
  const url =
    provider === 'google'
      ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
      : provider === 'deepseek'
        ? AI_CHAT_COMPLETIONS_URL
        : provider === 'hermes'
          ? `${Deno.env.get('HERMES_BASE_URL') || 'https://api.hermes.ai/v1'}/chat/completions`
          : 'https://api.openai.com/v1/chat/completions';
  const response = await withRetry(
    () =>
      fetchWithTimeout(url, {
        method: 'POST',
        timeoutMs: 60_000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: params.model.replace('openai/', '').replace('google/', ''),
          messages: params.messages,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
        }),
      }),
    { attempts: 3, baseMs: 300 },
  );
  const result = await response.json();
  return normalizeOpenAIResponse(result);
}
