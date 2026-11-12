/**
 * Nexus Agents Studio — Widget Service
 * Wires the `widget-proxy` Edge Function to the UI.
 *
 * The widget-proxy EF serves an embeddable web chat widget script
 * (`<script src=".../widget-proxy/widget/{agent_id}.js">`) and exposes a
 * lightweight `/chat` endpoint the widget calls back into. Operators
 * use this service to generate embed snippets and to validate that the
 * widget endpoint is responding for a given agent.
 */

import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

const PROJECT_REF = 'qdlnzopxrlsoljcrcmzv';
const FUNCTIONS_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/widget-proxy`;

export interface WidgetEmbedSnippet {
  scriptUrl: string;
  htmlSnippet: string;
  agentId: string;
}

export interface WidgetChatInput {
  agent_id: string;
  message: string;
  session_id?: string;
  context?: Record<string, unknown>;
}

export interface WidgetChatResult {
  ok?: boolean;
  reply?: string;
  session_id?: string;
  error?: string;
}

/**
 * Builds the embed snippet for a given agent. Pure helper — no network call.
 * Operators copy this snippet into their own website to expose the agent
 * as a floating chat bubble.
 */
export function buildWidgetEmbedSnippet(agentId: string): WidgetEmbedSnippet {
  const scriptUrl = `${FUNCTIONS_BASE}/widget/${agentId}.js`;
  const htmlSnippet = `<script src="${scriptUrl}" async></script>`;
  return { scriptUrl, htmlSnippet, agentId };
}

/**
 * Posts a chat message through the widget-proxy `/chat` endpoint.
 * Used by the DeploymentsPage "Test Widget" panel so operators can
 * confirm the agent is responding before publishing the snippet.
 */
export async function sendWidgetChatMessage(
  input: WidgetChatInput
): Promise<WidgetChatResult> {
  if (!input.agent_id || !input.message) {
    throw new Error('agent_id and message are required');
  }

  // O widget-proxy roteia pelo caminho (/chat), não pelo corpo. O token do operador libera o teste de
  // agente ainda não publicado do próprio workspace.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${FUNCTIONS_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      agent_id: input.agent_id,
      message: input.message,
      session_id: input.session_id ?? `widget-test-${Date.now()}`,
    }),
  });
  const data = (await res.json().catch(() => null)) as (WidgetChatResult & { response?: string }) | null;

  if (!res.ok) {
    const message = data?.error ?? `HTTP ${res.status}`;
    logger.error('widget-proxy chat failed', { agent_id: input.agent_id, error: message });
    throw new Error(message);
  }

  return { ok: true, reply: data?.response ?? data?.reply, session_id: data?.session_id };
}

/**
 * Validates that the widget-proxy endpoint is reachable for the given
 * agent by issuing a HEAD-style sanity request. Returns true on 2xx.
 */
export async function checkWidgetEndpointAvailable(agentId: string): Promise<boolean> {
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/widget/${agentId}.js`, {
      method: 'GET',
      cache: 'no-store',
    });
    return res.ok;
  } catch (e) {
    logger.error('widget endpoint check failed', {
      agent_id: agentId,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
