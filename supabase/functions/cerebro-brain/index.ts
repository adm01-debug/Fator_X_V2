import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, _jsonResponse, _errorResponse, _checkRateLimit, _getRateLimitIdentifier, _createRateLimitResponse, _RATE_LIMITS } from "../_shared/mod.ts";
import { parseBody, z } from "../_shared/validation.ts";

// CORS handled by _shared/cors.ts — dynamic origin whitelist

const VALID_ACTIONS = ['knowledge_graph', 'knowledge_health', 'auto_extract', 'expert_discovery', 'brain_sandbox', 'stats', 'temporal_graph', 'entity_resolution', 'decay_detection', 'memory_manager', 'knowledge_decay'] as const;
type CerebroAction = typeof VALID_ACTIONS[number];

const VALID_EXTRACT_TYPES = ['entities', 'facts', 'rules', 'contacts'] as const;
const VALID_CONTEXT_MODES = ['facts_only', 'rag_only', 'full', 'no_context'] as const;

// Discriminated union por action: garante shape correto de cada payload.
const AutoExtractSchema = z.object({
  action: z.literal('auto_extract'),
  text: z.string().min(3).max(50000),
  extract_type: z.enum(VALID_EXTRACT_TYPES).optional(),
}).passthrough();

const BrainSandboxSchema = z.object({
  action: z.literal('brain_sandbox'),
  query: z.string().min(2).max(10000),
  context_mode: z.enum(VALID_CONTEXT_MODES).optional(),
}).passthrough();

const GenericActionSchema = z.object({
  action: z.enum(VALID_ACTIONS.filter(a => a !== 'auto_extract' && a !== 'brain_sandbox') as unknown as [CerebroAction, ...CerebroAction[]]),
}).passthrough();

const CerebroBodySchema = z.union([AutoExtractSchema, BrainSandboxSchema, GenericActionSchema]);

interface KnowledgeGraphNode {
  id: string;
  type: string;
  label: string;
  [key: string]: unknown;
}

interface KnowledgeGraphEdge {
  source: string;
  target: string;
  label: string;
  type: string;
}

interface HealthItem {
  id: string;
  type: string;
  name: string;
  daysSinceUpdate: number;
  freshness: string;
  [key: string]: unknown;
}



serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const validation = validateBody(rawBody);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const { action, data: body } = validation;

    const { data: member } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single();
    const _workspaceId = member?.workspace_id;

    // ═══ ACTION: knowledge_graph ═══
    if (action === 'knowledge_graph') {
      const nodes: KnowledgeGraphNode[] = [];
      const edges: KnowledgeGraphEdge[] = [];

      // Core entities
      const { data: agents } = await supabase.from('agents').select('id, name, avatar_emoji, status');
      for (const a of (agents || [])) {
        nodes.push({ id: a.id, type: 'agent', label: a.name, emoji: a.avatar_emoji, status: a.status });
      }

      const { data: kbs } = await supabase.from('knowledge_bases').select('id, name, status');
      for (const kb of (kbs || [])) {
        nodes.push({ id: kb.id, type: 'knowledge_base', label: kb.name, status: kb.status });
      }

      const { data: tools } = await supabase.from('tool_integrations').select('id, name, type, is_enabled');
      for (const t of (tools || [])) {
        nodes.push({ id: t.id, type: 'tool', label: t.name, toolType: t.type, enabled: t.is_enabled });
      }

      const { data: workflows } = await supabase.from('workflows').select('id, name, status');
      for (const w of (workflows || [])) {
        nodes.push({ id: w.id, type: 'workflow', label: w.name, status: w.status });
      }

      // Domain-specific entities (from knowledge_entities table)
      const { data: entities } = await supabase.from('knowledge_entities').select('id, name, entity_type, metadata');
      for (const e of (entities || [])) {
        nodes.push({ id: e.id, type: e.entity_type, label: e.name, metadata: e.metadata });
      }

      // Relations
      const { data: relations } = await supabase.from('knowledge_relations').select('source_id, target_id, relation_type, strength');
      for (const r of (relations || [])) {
        edges.push({ source: r.source_id, target: r.target_id, label: r.relation_type, type: r.relation_type, strength: r.strength });
      }

      // Hardcoded relations from system structure
      const { data: steps } = await supabase.from('workflow_steps').select('workflow_id, agent_id, name');
      for (const s of (steps || [])) {
        if (s.agent_id && s.workflow_id) {
          edges.push({ source: s.agent_id, target: s.workflow_id, label: s.name || 'step', type: 'participates' });
        }
      }

      return new Response(JSON.stringify({ nodes, edges }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: knowledge_health ═══
    if (action === 'knowledge_health') {
      const now = new Date();
      const items: HealthItem[] = [];

      const { data: kbs } = await supabase.from('knowledge_bases').select('id, name, updated_at, document_count, chunk_count');
      for (const kb of (kbs || [])) {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(kb.updated_at).getTime()) / 86400000);
        let freshness = 'fresh';
        if (daysSinceUpdate > 30) freshness = 'stale';
        else if (daysSinceUpdate > 7) freshness = 'aging';
        items.push({ id: kb.id, type: 'knowledge_base', name: kb.name, daysSinceUpdate, freshness, docs: kb.document_count, chunks: kb.chunk_count });
      }

      const { data: agents } = await supabase.from('agents').select('id, name, updated_at, status');
      for (const a of (agents || [])) {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(a.updated_at).getTime()) / 86400000);
        let freshness = 'fresh';
        if (daysSinceUpdate > 14) freshness = 'stale';
        else if (daysSinceUpdate > 3) freshness = 'aging';
        items.push({ id: a.id, type: 'agent', name: a.name, daysSinceUpdate, freshness, status: a.status });
      }

      const { count: pendingChunks } = await supabase.from('chunks').select('id', { count: 'exact', head: true }).eq('embedding_status', 'pending');
      const { count: failedChunks } = await supabase.from('chunks').select('id', { count: 'exact', head: true }).eq('embedding_status', 'failed');
      const { count: doneChunks } = await supabase.from('chunks').select('id', { count: 'exact', head: true }).eq('embedding_status', 'done');

      const gaps: string[] = [];
      const { count: docCount } = await supabase.from('documents').select('id', { count: 'exact', head: true });
      if (!docCount || docCount === 0) gaps.push('Nenhum documento na base de conhecimento');
      if (!kbs || kbs.length === 0) gaps.push('Nenhuma base de conhecimento criada');

      const { count: toolCount } = await supabase.from('tool_integrations').select('id', { count: 'exact', head: true });
      if (!toolCount || toolCount === 0) gaps.push('Nenhuma ferramenta integrada');

      const staleItems = items.filter(i => i.freshness === 'stale');
      if (staleItems.length > 0) gaps.push(`${staleItems.length} itens desatualizados (>14 dias sem mudança)`);

      return new Response(JSON.stringify({
        items,
        chunks: { pending: pendingChunks || 0, failed: failedChunks || 0, done: doneChunks || 0 },
        gaps,
        summary: {
          total: items.length,
          fresh: items.filter(i => i.freshness === 'fresh').length,
          aging: items.filter(i => i.freshness === 'aging').length,
          stale: items.filter(i => i.freshness === 'stale').length,
        }
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: auto_extract ═══
    if (action === 'auto_extract') {
      const text = body.text as string;
      const extract_type = (body.extract_type as string) || 'entities';

      // Layer 1: Use HF NER for entity extraction (fast, free, precise)
      const hfToken = Deno.env.get('HF_API_TOKEN');
      if (extract_type === 'entities' && hfToken) {
        try {
          const nerResp = await fetch('https://router.huggingface.co/hf-inference/models/dslim/bert-base-NER', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${hfToken}` },
            body: JSON.stringify({ inputs: text.substring(0, 5000) }),
          });
          if (nerResp.ok) {
            const nerEntities = await nerResp.json();
            if (Array.isArray(nerEntities) && nerEntities.length > 0) {
              // Group entities by type and deduplicate
              const grouped: Record<string, Set<string>> = {};
              const typeLabels: Record<string, string> = { PER: 'Pessoa', ORG: 'Organização', LOC: 'Local', MISC: 'Outros' };
              for (const e of nerEntities) {
                const type = (e.entity_group || e.entity || '').replace('B-', '').replace('I-', '');
                const label = typeLabels[type] || type;
                if (!grouped[label]) grouped[label] = new Set();
                if (e.word && e.word.length > 1 && !e.word.startsWith('##')) {
                  grouped[label].add(e.word.replace(/^#+/, '').trim());
                }
              }
              const formatted = Object.entries(grouped)
                .map(([type, names]) => `**${type}:** ${[...names].join(', ')}`)
                .join('\n');
              return new Response(JSON.stringify({
                extracted: formatted || 'Nenhuma entidade encontrada',
                type: extract_type,
                method: 'hf_ner',
                model: 'dslim/bert-base-NER',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
                entities_raw: nerEntities.filter((e: any) => e.score > 0.5),
                tokens: { total: 0 },
                cost_usd: 0,
              }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
            }
          }
        } catch (e: unknown) { console.error('HF NER failed, falling back to LLM:', e instanceof Error ? e.message : e); }
      }

      // Layer 2: LLM extraction (for facts, rules, contacts, or NER fallback)
      const extractPrompts: Record<string, string> = {
        entities: 'Extraia todas as entidades (pessoas, empresas, produtos, locais) do texto. Retorne em formato de lista com tipo e nome.',
        facts: 'Extraia todos os fatos e informações concretas do texto. Retorne como lista de afirmações objetivas.',
        rules: 'Extraia todas as regras de negócio, políticas e procedimentos do texto. Retorne como lista de regras claras.',
        contacts: 'Extraia todos os contatos (telefones, emails, endereços, nomes) do texto. Retorne de forma estruturada.',
      };

      const prompt = extractPrompts[extract_type] || extractPrompts.entities;

      const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
      const resp = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: `Você é um especialista em extração de informações. ${prompt}` },
            { role: 'user', content: text },
          ],
          temperature: 0.2, max_tokens: 2000,
        }),
      });
      const result = await resp.json();

      return new Response(JSON.stringify({
        extracted: result.content || result.error,
        type: extract_type,
        method: 'llm',
        model: 'google/gemini-2.5-flash',
        tokens: result.tokens,
        cost_usd: result.cost_usd,
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: expert_discovery ═══
    if (action === 'expert_discovery') {
      interface Expert {
        id: string;
        name: string;
        emoji: string;
        type: string;
        domains: string[];
        [key: string]: unknown;
      }
      const experts: Expert[] = [];

      const { data: agents } = await supabase.from('agents').select('id, name, avatar_emoji, mission, tags, config, status');
      for (const a of (agents || [])) {
        const config = (a.config || {}) as Record<string, unknown>;
        const domains: string[] = [];
        if (a.tags?.length) domains.push(...a.tags);
        if ((config.rag_knowledge_bases as unknown[])?.length) domains.push('RAG');
        if ((config.tools as unknown[])?.length) domains.push(`${(config.tools as unknown[]).length} ferramentas`);
        if ((config.memory_types as unknown[])?.length) domains.push('Memória avançada');

        experts.push({
          id: a.id, name: a.name, emoji: a.avatar_emoji, type: 'agent',
          mission: a.mission, domains, status: a.status,
          toolCount: (config.tools as unknown[])?.length || 0,
          hasRAG: !!((config.rag_knowledge_bases as unknown[])?.length),
        });
      }

      const { data: members } = await supabase.from('workspace_members').select('id, name, email, role');
      for (const m of (members || [])) {
        experts.push({
          id: m.id,
          name: m.name || m.email?.split('@')[0] || 'Membro',
          emoji: '👤', type: 'human', role: m.role,
          domains: [m.role || 'editor'],
        });
      }

      return new Response(JSON.stringify({ experts }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: brain_sandbox ═══
    if (action === 'brain_sandbox') {
      const query = body.query as string;
      const context_mode = (body.context_mode as string) || 'full';

      let contextParts: string[] = [];

      if (context_mode === 'facts_only' || context_mode === 'full') {
        const { count: agentCount } = await supabase.from('agents').select('id', { count: 'exact', head: true });
        const { count: kbCount } = await supabase.from('knowledge_bases').select('id', { count: 'exact', head: true });
        contextParts.push(`Fatos: ${agentCount || 0} agentes, ${kbCount || 0} bases de conhecimento`);
      }

      if (context_mode === 'rag_only' || context_mode === 'full') {
        const { data: chunks } = await supabase.from('chunks').select('content').eq('embedding_status', 'done').limit(10);
        if (chunks?.length) {
          contextParts.push('RAG:\n' + chunks.map((c: { content: string }) => c.content).join('\n---\n').substring(0, 2000));
        }
      }

      if (context_mode === 'no_context') {
        contextParts = ['Sem contexto adicional. Responda apenas com seu conhecimento geral.'];
      }

      const systemPrompt = `Você é o Super Cérebro (modo sandbox). Contexto disponível:\n${contextParts.join('\n\n')}\n\nResponda a pergunta do usuário.`;

      const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
      const resp = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: query }],
          temperature: 0.3, max_tokens: 3000,
        }),
      });
      const result = await resp.json();

      return new Response(JSON.stringify({
        response: result.content || result.error,
        context_mode,
        context_size: contextParts.join('').length,
        tokens: result.tokens,
        cost_usd: result.cost_usd,
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: temporal_events ═══
    if (action === 'temporal_graph') {
      const { data: events } = await supabase.from('agent_traces')
        .select('id, created_at, agent_id, event_type, metadata')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: agents } = await supabase.from('agents').select('id, name');
      const agentMap = Object.fromEntries((agents || []).map(a => [a.id, a.name]));

      const { data: relations } = await supabase.from('knowledge_relations')
        .select('*, source:knowledge_entities!source_id(name, entity_type), target:knowledge_entities!target_id(name, entity_type)')
        .order('created_at', { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({
        timeline: (events || []).map(e => ({
          id: e.id,
          time: e.created_at,
          agent: agentMap[e.agent_id!] || 'Sistema',
          type: e.event_type,
          info: e.metadata
        })),
        relations: relations || [],
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: entity_resolution ═══
    if (action === 'entity_resolution') {
      const { data: entities } = await supabase.from('knowledge_entities')
        .select('*')
        .order('importance_score', { ascending: false })
        .limit(200);

      const conflicts = (entities || [])
        .filter((e, i, arr) => arr.findIndex(t => t.name === e.name && t.entity_type === e.entity_type) !== i)
        .map(e => ({ id: e.id, term: e.name, reason: 'Duplicidade de entidade detectada' }));

      const { data: resolutionLogs } = await supabase.from('entity_resolution_logs')
        .select('*, primary_entity:knowledge_entities!primary_entity_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({
        entities: entities || [],
        resolved_count: (entities || []).length - conflicts.length,
        conflicts,
        logs: resolutionLogs || [],
        total_analyzed: (entities || []).length
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: decay_detection ═══
    if (action === 'decay_detection') {
      const { data: memories } = await supabase.from('agent_memories')
        .select('id, content, memory_type, importance, decay_rate, created_at')
        .order('created_at', { ascending: true })
        .limit(200);

      const now = new Date();
      const decayed = (memories || []).map(m => {
        const createdAt = m.created_at ? new Date(m.created_at) : now;
        const ageInDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
        const baseImportance = Number(m.importance || 0.5);
        const decayRate = Number(m.decay_rate || 0.01);
        
        // Decay formula: I(t) = I0 * e^(-rt)
        const currentScore = Math.max(0, baseImportance * Math.exp(-decayRate * (ageInDays / 30)));
        
        let status: 'active' | 'decaying' | 'forgotten' = 'active';
        if (currentScore < 0.2) status = 'forgotten';
        else if (currentScore < 0.4) status = 'decaying';

        return {
          id: m.id,
          content: m.content,
          type: m.memory_type,
          age: ageInDays,
          original_score: baseImportance,
          current_score: Number(currentScore.toFixed(3)),
          status
        };
      });

      return new Response(JSON.stringify({ items: decayed }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: memory_manager ═══
    if (action === 'memory_manager') {
       const { data: memories } = await supabase.from('agent_memories')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      const stats = {
        episodic: memories?.filter(m => m.memory_type === 'episodic').length || 0,
        semantic: memories?.filter(m => m.memory_type === 'semantic').length || 0,
        procedural: memories?.filter(m => m.memory_type === 'procedural').length || 0,
      };

      return new Response(JSON.stringify({ memories: memories || [], stats }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // ═══ ACTION: stats ═══
    if (action === 'stats') {
      const [agents, kbs, chunks, traces, memories, tools, workflows, entities, relations] = await Promise.all([
        supabase.from('agents').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_bases').select('id', { count: 'exact', head: true }),
        supabase.from('chunks').select('id', { count: 'exact', head: true }),
        supabase.from('agent_traces').select('id', { count: 'exact', head: true }),
        supabase.from('agent_memories').select('id', { count: 'exact', head: true }),
        supabase.from('tool_integrations').select('id', { count: 'exact', head: true }),
        supabase.from('workflows').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_entities').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_relations').select('id', { count: 'exact', head: true }),
      ]);

      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { count: todayTraces } = await supabase.from('agent_traces').select('id', { count: 'exact', head: true }).gte('created_at', yesterday);

      const { data: recentMemories } = await supabase.from('agent_memories')
        .select('id, memory_type, content, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      return new Response(JSON.stringify({
        agents: agents.count || 0,
        knowledge_bases: kbs.count || 0,
        chunks: chunks.count || 0,
        traces: traces.count || 0,
        memories: memories.count || 0,
        tools: tools.count || 0,
        workflows: workflows.count || 0,
        entities: entities.count || 0,
        relations: relations.count || 0,
        today_traces: todayTraces || 0,
        recent_memories: recentMemories || [],
      }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }



    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  }
});
