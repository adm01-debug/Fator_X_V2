import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/retry.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse, _checkRateLimit, _getRateLimitIdentifier, _createRateLimitResponse, _RATE_LIMITS } from "../_shared/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const CerebroBodySchema = z.object({
  query: z.string().trim().min(2).max(10000),
  stream: z.boolean().optional(),
}).passthrough();

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return errorResponse('Unauthorized', 401, req);

    const rawBody = await req.json().catch(() => null);
    const parsedBody = CerebroBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorResponse('Payload inválido: ' + JSON.stringify(parsedBody.error.flatten().fieldErrors), 400, req);
    }
    const { query, stream: streamOpt } = parsedBody.data;
    const stream = streamOpt === true;

    const { data: _member } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single();

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
          const rerankResp = await fetchWithTimeout(rerankUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
            body: JSON.stringify({ query, chunks, top_k: 5 }),
          });
          if (rerankResp.ok) {
            const rerankData = await rerankResp.json();
            if (rerankData.reranked?.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
              ragContext = rerankData.reranked.map((r: any) => r.chunk?.content || r.content).join('\n---\n').substring(0, 3000);
              ragReranked = true;
            }
          }
        } catch { /* fallback */ }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        if (!ragContext) ragContext = chunks.map((c: any) => c.content).join('\n---\n').substring(0, 3000);
      }
    } catch { /* skip */ }

    const systemPrompt = `Você é o Super Cérebro da Promo Brindes — a inteligência central da empresa.
Responda com base no contexto fornecido. Se não souber, seja honesto.
Fatos: ${facts.join('; ')}
RAG: ${ragContext || 'Nenhum dado disponível'}`;

    const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
    const resp = await fetchWithTimeout(gatewayUrl, {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
  } catch (error: any) {
    return errorResponse(error.message, 500, req);
  }
});
