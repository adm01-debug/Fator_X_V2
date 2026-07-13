import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, _errorResponse, _checkRateLimit, _getRateLimitIdentifier, _createRateLimitResponse, _RATE_LIMITS } from "../_shared/mod.ts";

// ═══ Types ═══
interface GraphNode {
  id: string;
  type: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  config: Record<string, any>;
}

interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
}

interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  entry_node: string;
}

interface WorkflowState {
  _current_node: string;
  _history: string[];
  _iteration_count: Record<string, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  _output: any;
  input: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  [key: string]: any;
}

// ═══ Constants ═══
const MAX_ITERATIONS = 50;
const STEP_TIMEOUT_MS = 30000;
const _SPACE_TIMEOUT = 120000;

// ═══ Helpers ═══
function safeEvalCondition(condition: string, state: WorkflowState): boolean {
  const output = String(state._output || '').toLowerCase();
  const cond = condition.toLowerCase();
  if (cond.includes('contains:')) {
    const search = cond.split('contains:')[1]?.trim();
    return output.includes(search || '');
  }
  if (cond === 'default' || cond === 'else') return true;
  if (cond.startsWith('length>')) {
    const threshold = parseInt(cond.split('>')[1] || '0');
    return output.length > threshold;
  }
  return false;
}

// ═══ Input Schema ═══
const WorkflowInput = z.object({
  workflow_id: z.string().uuid(),
  input: z.string().default(''),
  resume_run_id: z.string().uuid().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || `Bearer ${supabaseKey}`;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const body = await req.json();
    const parsed = WorkflowInput.safeParse(body);
    if (!parsed.success) return jsonResponse({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
    const { workflow_id, input, resume_run_id } = parsed.data;

    const streamRequested = req.headers.get('accept') === 'text/event-stream';

    // Load workflow
    const { data: workflow, error: wfErr } = await supabase.from('workflows').select('*').eq('id', workflow_id).single();
    if (wfErr || !workflow) return jsonResponse({ error: 'Workflow not found' }, 404);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
    const wfConfig = (workflow.config || {}) as Record<string, any>;
    const graph: WorkflowGraph = {
      nodes: (wfConfig.nodes as GraphNode[]) || [],
      edges: (wfConfig.edges as GraphEdge[]) || [],
      entry_node: (wfConfig.entry_node as string) || 'step_0',
    };

    // If no graph nodes, fall back to sequential steps
    if (graph.nodes.length === 0) {
      const { data: steps } = await supabase.from('workflow_steps').select('*').eq('workflow_id', workflow_id).order('step_order', { ascending: true });
      if (steps && steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          graph.nodes.push({ id: `step_${i}`, type: 'llm_call', label: steps[i].name, config: { role: steps[i].role, agent_id: steps[i].agent_id } });
          if (i > 0) graph.edges.push({ from: `step_${i - 1}`, to: `step_${i}` });
        }
        graph.nodes.push({ id: 'end', type: 'end', label: 'End', config: {} });
        graph.edges.push({ from: `step_${steps.length - 1}`, to: 'end' });
        graph.entry_node = 'step_0';
      }
    }

    if (graph.nodes.length === 0) return jsonResponse({ error: 'No nodes in workflow' }, 400);

    // Initialize or resume state
    let state: WorkflowState;
    let runId: string;

    if (resume_run_id) {
      const { data: existingRun } = await supabase.from('workflow_runs').select('*').eq('id', resume_run_id).single();
      if (!existingRun) return jsonResponse({ error: 'Run not found' }, 404);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      const existingOutput = existingRun.output as Record<string, any> | null;
      state = (existingOutput?.state as WorkflowState) || { _current_node: graph.entry_node, _history: [], _iteration_count: {}, _output: '', input };
      runId = existingRun.id;
      await supabase.from('workflow_runs').update({ status: 'running' }).eq('id', runId);
    } else {
      state = { _current_node: graph.entry_node, _history: [], _iteration_count: {}, _output: '', input };
      const { data: run } = await supabase.from('workflow_runs').insert({
        workflow_id, status: 'running', total_steps: graph.nodes.length,
      }).select('id').single();
      runId = run?.id || '';
    }

    const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
    let totalTokens = 0, totalCost = 0, stepsExecuted = 0;

    const executeStep = async (node: GraphNode): Promise<void> => {
      if (node.type === 'llm_call') {
        const model = (node.config.model as string) || 'claude-sonnet-4-20250514';
        const systemPrompt = (node.config.system_prompt as string) || `You are "${node.label}" in a workflow. ${node.config.role || ''}`;
        const resp = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: (state._output as string) || state.input || '' }],
            temperature: (node.config.temperature as number) || 0.7,
            max_tokens: (node.config.max_tokens as number) || 2000
          }),
          signal: AbortSignal.timeout(STEP_TIMEOUT_MS)
        });
        const result = await resp.json();
        state._output = result.content || '';
        state[`${node.id}_output`] = state._output;
        totalTokens += result.tokens?.total || 0;
        totalCost += result.cost_usd || 0;

      } else if (node.type === 'tool_call') {
        const toolType = (node.config.tool_type as string) || 'hf_inference';
        const hfToken = Deno.env.get('HF_API_TOKEN');

        if (toolType === 'hf_inference' && hfToken) {
          const hfModel = (node.config.hf_model as string) || 'dslim/bert-base-NER';
          const hfTask = (node.config.hf_task as string) || 'token-classification';
          const inputText = (state._output as string) || state.input || '';
          const resp = await fetch(`https://router.huggingface.co/hf-inference/models/${hfModel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfToken}` },
            body: JSON.stringify(hfTask === 'zero-shot-classification' ? { inputs: inputText.substring(0, 1000), parameters: { candidate_labels: (node.config.labels as string[]) || ['positive', 'negative', 'neutral'] } } : { inputs: inputText.substring(0, 2000) }),
            signal: AbortSignal.timeout(STEP_TIMEOUT_MS)
          });
          const result = await resp.json();
          state._output = JSON.stringify(result, null, 2);
          state[`${node.id}_output`] = state._output;
        } else if (toolType === 'webhook' && node.config.webhook_url) {
          const resp = await fetch(node.config.webhook_url as string, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: state._output || state.input, node_id: node.id, run_id: runId }),
            signal: AbortSignal.timeout(STEP_TIMEOUT_MS)
          });
          const result = await resp.json();
          state._output = typeof result === 'string' ? result : JSON.stringify(result);
          state[`${node.id}_output`] = state._output;
        } else if (toolType === 'edge_function' && node.config.function_name) {
          const resp = await fetch(`${supabaseUrl}/functions/v1/${node.config.function_name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
            body: JSON.stringify({ action: node.config.function_action, text: (state._output as string) || state.input || '', ...((node.config.extra_params as Record<string, any>) || {}) }),
            signal: AbortSignal.timeout(STEP_TIMEOUT_MS)
          });
          const result = await resp.json();
          state._output = typeof result === 'string' ? result : JSON.stringify(result);
          state[`${node.id}_output`] = state._output;
        } else if (toolType === 'smolagent') {
          const task = (node.config.task as string) || (state._output as string) || state.input || '';
          const tools = (node.config.available_tools as string[]) || [];
          const agentModel = (node.config.model as string) || 'huggingface/Qwen/Qwen3-30B-A3B';
          const toolDescriptions = tools.length > 0 ? `\nAvailable tools: ${tools.join(', ')}\nCall tools with: result = tool_name(args)` : '';

          const resp = await fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
            body: JSON.stringify({
              model: agentModel,
              messages: [
                { role: 'system', content: `You are a smolagent — a code-first AI agent. Given a task, write Python code to solve it.\nYou can use: print(), len(), sorted(), json, math, datetime, re.${toolDescriptions}\nAssign the final result to a variable called 'result'.\nRespond with:\n1. Code block\n2. "RESULT:" followed by the expected output` },
                { role: 'user', content: `Task: ${task}` },
              ],
              temperature: 0.2, max_tokens: 2000,
            }),
            signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
          });
          const smolResult = await resp.json();
          const smolOutput = smolResult.content || '';
          const resultMatch = smolOutput.match(/RESULT:\s*([\s\S]*?)$/i);
          state._output = resultMatch ? resultMatch[1].trim() : smolOutput;
          state[`${node.id}_output`] = state._output;
          state[`${node.id}_code`] = smolOutput;
          totalTokens += smolResult.tokens?.total || 0;
          totalCost += smolResult.cost_usd || 0;
        }
      } else if (node.type === 'smolagent_runtime') {
        const agentTask = (node.config.task as string) || (state._output as string) || state.input || '';
        const resp = await fetch(`${supabaseUrl}/functions/v1/smolagent-runtime`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
          body: JSON.stringify({
            action: node.config.tool_names ? 'run_with_tools' : 'run',
            task: agentTask,
            model: node.config.model || 'huggingface/Qwen/Qwen3-30B-A3B',
            max_steps: node.config.max_steps || 8,
            tool_names: node.config.tool_names,
          }),
          signal: AbortSignal.timeout(120000),
        });
        const agentResult = await resp.json();
        state._output = agentResult.answer || JSON.stringify(agentResult);
        state[`${node.id}_output`] = state._output;
        state[`${node.id}_steps`] = agentResult.steps;
        totalTokens += agentResult.total_tokens || 0;
        totalCost += agentResult.total_cost_usd || 0;
      }
    };

    if (streamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
          const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          send({ event: 'run_start', run_id: runId });

          try {
            while (state._current_node && state._current_node !== '') {
              const node = graph.nodes.find(n => n.id === state._current_node);
              if (!node || node.type === 'end') break;

              send({ event: 'node_start', node_id: node.id, label: node.label, type: node.type });

              // Cycle detection
              state._iteration_count[node.id] = (state._iteration_count[node.id] || 0) + 1;
              if (state._iteration_count[node.id] > MAX_ITERATIONS) throw new Error(`Cycle limit reached at "${node.label}"`);

              state._history.push(node.id);
              
              if (node.type === 'hitl_gate') {
                await supabase.from('workflow_runs').update({
                  status: 'awaiting_approval', current_step: stepsExecuted,
                  output: { state, pending_approval: { node_id: node.id, label: node.label, context: (state._output as string)?.substring(0, 500) } },
                }).eq('id', runId);
                send({ event: 'hitl_paused', node_id: node.id });
                break;
              }

              await executeStep(node);
              
              send({ event: 'node_end', node_id: node.id, output: state._output });

              stepsExecuted++;
              await supabase.from('workflow_runs').update({ 
                current_step: stepsExecuted, 
                total_cost: totalCost,
                total_tokens: totalTokens,
                output: { state: { ...state, _history: state._history.slice(-20) } } 
              }).eq('id', runId);

              // Resolve next node
              const outEdges = graph.edges.filter(e => e.from === node.id);
              if (outEdges.length === 0) break;
              
              let nextNode: string | null = null;
              if (node.type === 'conditional') {
                for (const edge of outEdges) {
                  if (edge.condition && safeEvalCondition(edge.condition, state)) {
                    nextNode = edge.to;
                    break;
                  }
                }
                if (!nextNode) nextNode = outEdges.find(e => !e.condition)?.to || outEdges[0].to;
              } else {
                nextNode = outEdges[0].to;
              }
              state._current_node = nextNode || '';
            }

            await supabase.from('workflow_runs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', runId);
            send({ event: 'run_completed', output: state._output, cost: totalCost });
          } catch (e) {
            const errMsg = (e as Error).message;
            await supabase.from('workflow_runs').update({ status: 'failed', error: errMsg }).eq('id', runId);
            send({ event: 'error', message: errMsg });
          } finally {
            controller.close();
          }
        }
      });
      return new Response(stream, { headers: { ...getCorsHeaders(), 'Content-Type': 'text/event-stream' } });
    }

    // Standard execution for non-stream
    while (state._current_node && state._current_node !== '') {
      const node = graph.nodes.find(n => n.id === state._current_node);
      if (!node || node.type === 'end') break;
      
      state._iteration_count[node.id] = (state._iteration_count[node.id] || 0) + 1;
      if (state._iteration_count[node.id] > MAX_ITERATIONS) return jsonResponse({ error: `Cycle limit reached at "${node.label}"` }, 400);

      state._history.push(node.id);
      
      if (node.type === 'hitl_gate') {
        await supabase.from('workflow_runs').update({
          status: 'awaiting_approval', current_step: stepsExecuted,
          output: { state, pending_approval: { node_id: node.id, label: node.label } },
        }).eq('id', runId);
        return jsonResponse({ status: 'awaiting_approval', run_id: runId });
      }

      await executeStep(node);
      stepsExecuted++;
      
      const outEdges = graph.edges.filter(e => e.from === node.id);
      if (outEdges.length === 0) break;
      
      let nextNode: string | null = null;
      if (node.type === 'conditional') {
        for (const edge of outEdges) {
          if (edge.condition && safeEvalCondition(edge.condition, state)) {
            nextNode = edge.to;
            break;
          }
        }
        if (!nextNode) nextNode = outEdges.find(e => !e.condition)?.to || outEdges[0].to;
      } else {
        nextNode = outEdges[0].to;
      }
      state._current_node = nextNode || '';
    }

    await supabase.from('workflow_runs').update({ status: 'completed', finished_at: new Date().toISOString(), total_cost: totalCost, total_tokens: totalTokens }).eq('id', runId);
    return jsonResponse({ status: 'completed', run_id: runId, output: state._output, cost: totalCost, tokens: totalTokens, stepsExecuted });

  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
