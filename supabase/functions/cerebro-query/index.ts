import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse, checkRateLimit, getRateLimitIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/mod.ts";

// CORS handled by _shared/cors.ts — dynamic origin whitelist

function validateBody(body: unknown): { valid: true; query: string } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Request body must be a JSON object' };
  const b = body as Record<string, unknown>;
  if (typeof b.query !== 'string' || b.query.trim().length < 2 || b.query.length > 10000) {
    return { valid: false, error: 'query must be a string (2-10000 chars)' };
  }
  return { valid: true, query: b.query };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse('Unauthorized', 401, req);

    let rawBody: any;
    try { rawBody = await req.json(); } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }

    const validation = validateBody(rawBody);
    if (!validation.valid) return errorResponse(validation.error, 400, req);
    const { query } = validation;
    const stream = rawBody.stream === true;

    const { data: member } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single();

    // ═══ Gather context from LOCAL Supabase tables ═══
    const facts: string[] = [];
    const { count: agentCount } = await supabase.from('agents').select('id', { count: 'exact', head: true });
    if (agentCount) facts.push(`Temos ${agentCount} agentes configurados na plataforma`);
    const { count: kbCount } = await supabase.from('knowledge_bases').select('id', { count: 'exact', head: true });
    if (kbCount) facts.push(`Temos ${kbCount} bases de conhecimento`);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const { count: traceCount } = await supabase.from('agent_traces').select('id', { count: 'exact', head: true }).gte('created_at', yesterday);
    if (traceCount) facts.push(`${traceCount} interações nas últimas 24h`);

    // ═══ RAG context with reranking ═══
    let ragContext = '';
    let ragReranked = false;
    try {
      const { data: chunks } = await supabase.from('chunks').select('id, content, metadata').eq('embedding_status', 'done').limit(15);
      if (chunks?.length) {
        try {
          const rerankUrl = `${supabaseUrl}/functions/v1/rag-rerank`;
          const rerankResp = await fetch(rerankUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
            body: JSON.stringify({ query, chunks, top_k: 5 }),
          });
          if (rerankResp.ok) {
            const rerankData = await rerankResp.json();
            if (rerankData.reranked?.length > 0) {
              ragContext = rerankData.reranked.map((r: any) => r.chunk?.content || r.content).join('\n---\n').substring(0, 3000);
              ragReranked = true;
            }
          }
        } catch { /* fallback */ }
        if (!ragContext) ragContext = chunks.map((c: any) => c.content).join('\n---\n').substring(0, 3000);
      }
    } catch { /* skip */ }

    const systemPrompt = `Você é o Super Cérebro da Promo Brindes — a inteligência central da empresa.
Responda com base no contexto fornecido. Se não souber, seja honesto.
Fatos: ${facts.join('; ')}
RAG: ${ragContext || 'Nenhum dado disponível'}`;

    const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
    const resp = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: query }],
        temperature: 0.5,
        stream,
      }),
    });

    if (stream) {
      return new Response(resp.body, { headers: { ...getCorsHeaders(req), 'Content-Type': 'text/event-stream' } });
    }

    const result = await resp.json();
    return jsonResponse({
      response: result.content || result.error,
      facts_loaded: facts.length,
      rag_reranked: ragReranked,
      tokens: result.tokens,
      cost_usd: result.cost_usd,
    }, req);

  } catch (error: any) {
    return errorResponse(error.message, 500, req);
  }
});
