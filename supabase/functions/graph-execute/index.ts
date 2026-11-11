// Multi-Agent Graph Executor (LangGraph-style BFS)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout, withRetry } from '../_shared/retry.ts';
import { checkIdempotency, saveIdempotency } from '../_shared/idempotency.ts';
import { appendSkillsToPrompt, loadAgentSkills, type RuntimeSkill } from '../_shared/skills.ts';

import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  requireEnv,
  getCorsHeaders,
} from '../_shared/mod.ts';
import { AI_API_KEY_ENV, AI_CHAT_COMPLETIONS_URL, aiModel } from '../_shared/ai-provider.ts';
const InputSchema = z.object({
  graph_id: z.string().uuid(),
  input: z.string().min(1).max(20000),
});

const MAX_NODES = 15;
const LOVABLE_KEY = Deno.env.get(AI_API_KEY_ENV) ?? '';
const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

interface GraphNode {
  id: string;
  agent_id?: string | null;
  role?: string;
  label?: string;
  position?: { x: number; y: number };
}
interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
}

async function callLLM(
  systemPrompt: string,
  userInput: string,
): Promise<{ text: string; latency: number; cost_cents: number }> {
  const start = Date.now();
  const res = await withRetry(
    () =>
      fetchWithTimeout(AI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        timeoutMs: 60_000,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_KEY}` },
        body: JSON.stringify({
          model: aiModel('google/gemini-2.5-flash'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput },
          ],
        }),
      }),
    { attempts: 3, baseMs: 300 },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const tokens = data.usage?.total_tokens ?? 0;
  return { text, latency: Date.now() - start, cost_cents: Math.ceil(tokens * 0.0002) };
}

async function chooseNextNode(
  currentOutput: string,
  candidates: { node: GraphNode; condition?: string }[],
): Promise<string> {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0].node.id;
  const prompt = `Based on the previous agent output, decide which path to take next. Reply ONLY with the chosen node id.\n\nPrevious output: ${currentOutput.slice(0, 800)}\n\nOptions:\n${candidates.map((c) => `- ${c.node.id} (${c.node.label || c.node.role || 'node'})${c.condition ? ': ' + c.condition : ''}`).join('\n')}`;
  const { text } = await callLLM(
    'You are a routing decision engine. Reply with exactly one node id from the list.',
    prompt,
  );
  const cleaned = text.trim().replace(/[`"']/g, '').split(/\s|\n/)[0];
  return candidates.find((c) => c.node.id === cleaned)?.node.id ?? candidates[0].node.id;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const identifier = getRateLimitIdentifier(req);
  const rate = await checkRateLimit(identifier, RATE_LIMITS.heavy);
  if (!rate.allowed) return createRateLimitResponse(rate, getCorsHeaders(req));

  try {
    const auth = req.headers.get('Authorization');
    if (!auth)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const userClient = createClient(SUPABASE_URL, requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const raw = await req.json().catch(() => null);
    const parsed = InputSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Payload inválido', details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const { graph_id, input } = parsed.data;

    // Idempotency: se o cliente forneceu Idempotency-Key, retornamos cache em replays
    const idemKeyHeader = req.headers.get('Idempotency-Key');
    const idemKey = idemKeyHeader ? `graph-execute:${user.id}:${idemKeyHeader}` : '';
    if (idemKey) {
      const dup = await checkIdempotency(idemKey, supabase);
      if (dup.isDuplicate && dup.response) return dup.response;
    }

    const { data: graph, error: ge } = await supabase
      .from('agent_graphs')
      .select('*')
      .eq('id', graph_id)
      .single();
    if (ge || !graph)
      return new Response(JSON.stringify({ error: 'Graph not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const nodes: GraphNode[] = graph.nodes || [];
    const edges: GraphEdge[] = graph.edges || [];
    const entryId: string = graph.entry_node_id || nodes[0]?.id;
    if (!entryId)
      return new Response(JSON.stringify({ error: 'Graph has no entry node' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    // Create execution record
    const { data: exec, error: ee } = await supabase
      .from('graph_executions')
      .insert({
        graph_id,
        user_id: user.id,
        workspace_id: graph.workspace_id,
        input,
        status: 'running',
        current_node_id: entryId,
      })
      .select()
      .single();
    if (ee || !exec) throw new Error('Failed to create execution: ' + ee?.message);

    // Pre-fetch agents
    const agentIds = [...new Set(nodes.map((n) => n.agent_id).filter(Boolean))] as string[];
    const { data: agents } = agentIds.length
      ? await supabase.from('agents').select('id, name, persona, mission').in('id', agentIds)
      : { data: [] };
    const agentMap = new Map((agents || []).map((a) => [a.id, a]));

    // Pré-carrega as skills instaladas de cada agente (uma vez por grafo,
    // evitando N+1 dentro do loop BFS). Falha suave: mapa vazio.
    const skillsByAgent = new Map<string, RuntimeSkill[]>();
    for (const id of agentIds) {
      skillsByAgent.set(id, await loadAgentSkills(supabase, id));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
    const trace: any[] = [];
    let totalCost = 0;
    let currentNodeId = entryId;
    let currentInput = input;
    let finalOutput = '';
    let stepCount = 0;

    while (currentNodeId && stepCount < MAX_NODES) {
      stepCount++;
      const node = nodes.find((n) => n.id === currentNodeId);
      if (!node) break;
      const agent = node.agent_id ? agentMap.get(node.agent_id) : null;
      const baseSystemPrompt = agent
        ? `You are ${agent.name}. ${agent.persona || ''}\nMission: ${agent.mission || ''}\nRole in workflow: ${node.role || node.label || 'agent'}`
        : `You are an agent in a multi-agent workflow. Role: ${node.role || node.label || 'process input'}`;
      const nodeSkills = node.agent_id ? (skillsByAgent.get(node.agent_id) ?? []) : [];
      const systemPrompt = appendSkillsToPrompt(baseSystemPrompt, nodeSkills);

      const { text, latency, cost_cents } = await callLLM(systemPrompt, currentInput);
      totalCost += cost_cents;
      trace.push({
        node_id: node.id,
        agent_id: node.agent_id ?? null,
        agent_name: agent?.name ?? node.label ?? node.id,
        input: currentInput.slice(0, 2000),
        output: text,
        latency_ms: latency,
        cost_cents,
        // Observabilidade: quantas skills entraram no prompt deste nó.
        skills_injected_count: nodeSkills.length,
        ts: new Date().toISOString(),
      });

      // Persist incremental progress
      await supabase
        .from('graph_executions')
        .update({
          trace,
          current_node_id: currentNodeId,
          total_cost_cents: totalCost,
        })
        .eq('id', exec.id);

      // Find next node(s)
      const outgoing = edges.filter((e) => e.from === currentNodeId);
      if (outgoing.length === 0) {
        finalOutput = text;
        break;
      }
      const candidates = outgoing
        .map((e) => ({ node: nodes.find((n) => n.id === e.to)!, condition: e.condition }))
        .filter((c) => c.node);
      currentNodeId = await chooseNextNode(text, candidates);
      currentInput = text;
    }

    if (!finalOutput) finalOutput = trace[trace.length - 1]?.output || '';
    await supabase
      .from('graph_executions')
      .update({
        status: 'completed',
        final_output: finalOutput,
        ended_at: new Date().toISOString(),
        trace,
        total_cost_cents: totalCost,
      })
      .eq('id', exec.id);

    const responseBody = {
      execution_id: exec.id,
      final_output: finalOutput,
      steps: trace.length,
      total_cost_cents: totalCost,
    };
    if (idemKey) await saveIdempotency(idemKey, 200, responseBody, supabase);

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('graph-execute error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
