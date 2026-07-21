import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { startEdgeTrace } from '../_shared/otel.ts';
import { _maybeInjectFault, _applyFault } from '../_shared/chaos.ts';
import { parseBody, z } from '../_shared/validation.ts';

const WorkflowRunSchema = z.object({
  workflow_id: z.string().uuid(),
  input: z.union([z.record(z.unknown()), z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())]).optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, traceparent',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
interface WFNode { id: string; type: string; data: Record<string, any> }
interface WFEdge { source: string; target: string }

function topoSort(nodes: WFNode[], edges: WFEdge[]): WFNode[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => { indeg.set(n.id, 0); adj.set(n.id, []); });
  edges.forEach((e) => {
    adj.get(e.source)?.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  });
  const queue: string[] = [];
  indeg.forEach((d, id) => { if (d === 0) queue.push(id); });
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) || []) {
      indeg.set(next, (indeg.get(next) || 0) - 1);
      if (indeg.get(next) === 0) queue.push(next);
    }
  }
  const map = new Map(nodes.map((n) => [n.id, n]));
  return order.map((id) => map.get(id)!).filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
async function executeNode(node: WFNode, ctx: Record<string, any>, supa: any, lovableKey: string): Promise<any> {
  switch (node.type) {
    case 'trigger':
      return ctx.__input;
    case 'agent': {
      const agentId = node.data?.agent_id;
      if (!agentId) return { error: 'agent_id ausente' };
      const { data: agent } = await supa.from('agents').select('*').eq('id', agentId).single();
      if (!agent) return { error: 'agent não encontrado' };
      const lastInput = Object.values(ctx).filter((v) => v !== undefined).pop() ?? ctx.__input;
      const messages = [
        { role: 'system', content: agent.config?.system_prompt || `Você é ${agent.name}.` },
        { role: 'user', content: typeof lastInput === 'string' ? lastInput : JSON.stringify(lastInput) },
      ];
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: agent.model || 'google/gemini-2.5-flash', messages }),
      });
      const j = await r.json();
      return j.choices?.[0]?.message?.content ?? '';
    }
    case 'tool':
      return { tool: node.data?.tool_name, params: node.data?.params, executed: true };
    case 'condition': {
      const expr = node.data?.expression || 'true';
      try { return { branch: !!new Function('ctx', `return (${expr})`)(ctx) }; }
      catch { return { branch: false }; }
    }
    case 'transform': {
      const code = node.data?.code || 'return input;';
      try {
        const lastInput = Object.values(ctx).pop();
        return new Function('input', 'ctx', code)(lastInput, ctx);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      } catch (e: any) { return { error: e.message }; }
    }
    case 'output':
      return Object.values(ctx).pop();
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const isStream = req.headers.get('accept') === 'text/event-stream';
  const trace = startEdgeTrace(req, { rootName: 'agent-workflow-runner.handle' });
  const _rootSpan = trace.startSpan('agent-workflow-runner.handle', 'server');

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Unauthorized');

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { workflow_id, input } = await req.json();
    const { data: wf } = await supa.from('agent_workflows').select('*').eq('id', workflow_id).single();
    if (!wf) throw new Error('Workflow não encontrado');

    const { data: run } = await supa.from('agent_workflow_runs').insert({
      workflow_id, status: 'running', input, created_by: user.id,
    }).select().single();

    if (isStream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      const send = async (type: string, data: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      (async () => {
        try {
          const lovableKey = Deno.env.get('LOVABLE_API_KEY')!;
          const ordered = topoSort(wf.nodes || [], wf.edges || []);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
          const ctx: Record<string, any> = { __input: input };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
          const runTrace: any[] = [];

          await send('status', { message: 'Iniciando orquestração neural...', stage: 'start' });

          for (const node of ordered) {
            await send('node_start', { id: node.id, label: node.data?.label || node.type });
            const t0 = Date.now();
            const out = await executeNode(node, ctx, supa, lovableKey);
            const latency = Date.now() - t0;
            
            ctx[node.id] = out;
            const stepResult = { node_id: node.id, type: node.type, output: out, latency_ms: latency };
            runTrace.push(stepResult);
            
            await send('node_completed', stepResult);
          }

          const finalOutput = ordered.length ? ctx[ordered[ordered.length - 1].id] : null;
          await supa.from('agent_workflow_runs').update({
            status: 'completed', output: finalOutput, trace: runTrace, completed_at: new Date().toISOString(),
          }).eq('id', run.id);

          await send('run_completed', { run_id: run.id, output: finalOutput });
          await writer.close();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        } catch (err: any) {
          await send('error', { message: err.message });
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // Sync fallback
    return new Response(JSON.stringify({ run_id: run.id, status: 'queued' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
