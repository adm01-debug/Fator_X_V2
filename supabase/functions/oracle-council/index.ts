import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse, checkRateLimit, getRateLimitIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/mod.ts";

// CORS handled by _shared/cors.ts — dynamic origin whitelist

// ═══ Rate Limiting ═══
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 10; // Oracle is expensive — 10 req/min
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

// ═══ Input Validation ═══
const VALID_MODES = ['council', 'researcher', 'validator', 'executor', 'advisor'];

function validateRequest(body: unknown): { valid: true; data: OracleRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') return { valid: false, error: 'Request body must be a JSON object' };
  const b = body as Record<string, unknown>;

  if (typeof b.query !== 'string' || b.query.trim().length < 3 || b.query.length > 10000) {
    return { valid: false, error: 'query must be a string (3-10000 chars)' };
  }
  
  const mode = typeof b.mode === 'string' && VALID_MODES.includes(b.mode) ? b.mode : 'council';
  
  if (!Array.isArray(b.members) || b.members.length < 2 || b.members.length > 10) {
    return { valid: false, error: 'members must be an array with 2-10 items' };
  }
  for (const m of b.members) {
    if (!m || typeof m !== 'object') return { valid: false, error: 'Each member must be an object' };
    const mem = m as Record<string, unknown>;
    if (typeof mem.model !== 'string' || mem.model.length < 2) {
      return { valid: false, error: 'Each member must have a valid model string' };
    }
  }

  return {
    valid: true,
    data: {
      query: b.query as string,
      mode,
      members: b.members as Array<{ model: string; persona?: string }>,
      chairman_model: typeof b.chairman_model === 'string' ? b.chairman_model : undefined,
      enable_peer_review: b.enable_peer_review !== false,
      enable_thinking: b.enable_thinking === true,
      preset_id: typeof b.preset_id === 'string' ? b.preset_id : undefined,
    },
  };
}

interface OracleRequest {
  query: string;
  mode: string;
  members: Array<{ model: string; persona?: string }>;
  chairman_model?: string;
  enable_peer_review?: boolean;
  enable_thinking?: boolean;
  preset_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    // Rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 Oracle requests per minute.' }), { status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }

    // Validate input
    let rawBody: unknown;
    try { rawBody = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const validation = validateRequest(rawBody);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const { query, mode, members, chairman_model, enable_peer_review = true, enable_thinking = false } = validation.data;

    const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
    const totalStartTime = Date.now();

    // Build system prompt based on mode
    const buildSystemPrompt = (member: { model: string; persona?: string }) => {
      const thinkingInstructions = enable_thinking
        ? '\n\nAntes de dar sua resposta final, pense passo a passo:\n💭 Passo 1: Quais são os fatos relevantes?\n💭 Passo 2: Quais são as possíveis abordagens?\n💭 Passo 3: Quais são os riscos?\n💭 Passo 4: Minha recomendação e por quê?\n\nSepare claramente o raciocínio da resposta final usando "## Resposta" antes da resposta.'
        : '';

      const modeInstructions: Record<string, string> = {
        council: `Você é ${member.persona || 'um especialista'}. Responda de forma completa e fundamentada.${thinkingInstructions}`,
        researcher: `Você é ${member.persona || 'um pesquisador'}. Analise a questão em profundidade, cite dados e tendências relevantes. Estruture a resposta com seções claras.${thinkingInstructions}`,
        validator: `Você é ${member.persona || 'um verificador de fatos'}. Verifique a veracidade da afirmação/pergunta. Classifique como: CONFIRMADO, DISPUTADO ou NÃO VERIFICADO. Apresente evidências a favor e contra.${thinkingInstructions}`,
        executor: `Você é ${member.persona || 'um executor'}. Decomponha a tarefa em sub-tarefas concretas e acionáveis. Para cada sub-tarefa, indique: responsável sugerido, prazo estimado, e dependências.${thinkingInstructions}`,
        advisor: `Você é ${member.persona || 'um conselheiro'}. Analise a decisão apresentada. Liste prós e contras de cada opção, avalie riscos, e dê uma recomendação fundamentada com score de confiança.${thinkingInstructions}`,
      };
      return modeInstructions[mode] || modeInstructions.council;
    };

    // ═══ STAGE 1: Parallel Polling (with Streaming) ═══
    const stage1Start = Date.now();
    
    // Check if client wants streaming
    const isStream = req.headers.get('accept') === 'text/event-stream';

    if (isStream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      const sendUpdate = async (type: string, data: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      (async () => {
        try {
          await sendUpdate('stage', { stage: 1, label: 'Coletando opiniões...' });
          
          const stage1Promises = members.map(async (member, idx) => {
            const mStart = Date.now();
            const response = await fetch(gatewayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': authHeader!, 'apikey': supabaseKey },
              body: JSON.stringify({
                model: member.model,
                messages: [
                  { role: 'system', content: buildSystemPrompt(member) },
                  { role: 'user', content: query },
                ],
                temperature: mode === 'validator' ? 0.3 : 0.7,
                max_tokens: 3000,
              }),
            });
            const result = await response.json();
            
            let content = result.content || result.error || 'No response';
            let thinking = '';
            if (enable_thinking && content.includes('💭')) {
              const splitIdx = content.indexOf('## Resposta');
              if (splitIdx > -1) {
                thinking = content.substring(0, splitIdx).trim();
                content = content.substring(splitIdx).trim();
              }
            }

            const mResult = {
              index: idx, model: member.model, persona: member.persona || 'General',
              content, thinking,
              tokens: result.tokens || { total: 0 }, cost_usd: result.cost_usd || 0,
              latency_ms: Date.now() - mStart, success: !result.error,
            };
            
            await sendUpdate('member_response', mResult);
            return mResult;
          });

          const stage1 = await Promise.all(stage1Promises);
          const successfulResponses = stage1.filter(r => r.success);

          if (successfulResponses.length < 2) {
            throw new Error('Membros insuficientes para quorum');
          }

          // STAGE 2: Peer Review
          let stage2Results: any[] = [];
          if (enable_peer_review) {
            await sendUpdate('stage', { stage: 2, label: 'Realizando Peer-Review...' });
            const anonymized = successfulResponses.map((r, i) => `## Resposta ${String.fromCharCode(65 + i)}\n${r.content}`).join('\n\n---\n\n');
            const reviewPrompt = `Pergunta: "${query}"\n\nAvalie as respostas anônimas acima. Identifique pontos de consenso e divergências. Cite especificamente "Resposta A", "Resposta B", etc.\n\nResponda APENAS em JSON válido com este formato: {"consensus_degree": number, "consensus_points": [{"claim": string, "category": "fact"|"opinion", "consensusLevel": "strong"|"partial"|"disputed"}], "divergences": [string]}`;
            
            const reviewModel = chairman_model || successfulResponses[0].model;
            const reviewResponse = await fetch(gatewayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': authHeader!, 'apikey': supabaseKey },
              body: JSON.stringify({
                model: reviewModel,
                messages: [
                  { role: 'system', content: 'Você é um avaliador imparcial e crítico. Responda SOMENTE em JSON.' },
                  { role: 'user', content: reviewPrompt },
                ],
                temperature: 0.2,
              }),
            });
            const reviewResult = await reviewResponse.json();
            try {
              const jsonMatch = reviewResult.content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsedReview = JSON.parse(jsonMatch[0]);
                stage2Results = [parsedReview];
                await sendUpdate('review_complete', parsedReview);
              }
            } catch (e) { console.error('Stage 2 JSON Error', e); }
          }

          // STAGE 3: Synthesis
          await sendUpdate('stage', { stage: 3, label: 'Presidente sintetizando veredito...' });
          const chairmanModel = chairman_model || successfulResponses[0].model;
          const reviewData = stage2Results[0] || {};
          const synthesisPrompt = `Pergunta: "${query}"\n\nRespostas do Conselho:\n${successfulResponses.map((r, i) => `[Membro ${i+1} (${r.model})]: ${r.content}`).join('\n\n---\n\n')}\n\nAnálise de Consenso:\n${JSON.stringify(reviewData)}\n\nSintetize a resposta final. Use citações inline como [Membro 1] para atribuir ideias. Garanta que divergências sejam apresentadas de forma neutra. Use Markdown estruturado.`;
          
          const synthesisResponse = await fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader!, 'apikey': supabaseKey },
            body: JSON.stringify({
              model: chairmanModel,
              messages: [
                { role: 'system', content: 'Você é o Chairman do Oráculo. Sua missão é criar um veredito equilibrado e fundamentado.' },
                { role: 'user', content: synthesisPrompt },
              ],
              temperature: 0.4,
            }),
          });
          const synthesisResult = await synthesisResponse.json();
          const finalContent = synthesisResult.content || '';
          
          await sendUpdate('final', {
            final_response: finalContent,
            confidence_score: Math.round((reviewData.consensus_degree || 85) * 0.9 + (successfulResponses.length / members.length) * 10),
            consensus_degree: reviewData.consensus_degree || 75,
            consensus_points: reviewData.consensus_points || [],
            metrics: {
              total_latency_ms: Date.now() - totalStartTime,
              total_cost_usd: stage1.reduce((s, r) => s + (r.cost_usd || 0), 0) + (synthesisResult.cost_usd || 0),
              total_tokens: stage1.reduce((s, r) => s + (r.tokens?.total || 0), 0) + (synthesisResult.tokens?.total || 0),
              models_used: successfulResponses.length,
            }
          });
          await writer.close();
        } catch (err: any) {
          await sendUpdate('error', err.message);
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // --- Legacy Sync Flow ---
    const stage1Promises = members.map(async (member, idx) => {
      try {
        const response = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader!, 'apikey': supabaseKey },
          body: JSON.stringify({
            model: member.model,
            messages: [
              { role: 'system', content: buildSystemPrompt(member) },
              { role: 'user', content: query },
            ],
            temperature: 0.7,
            max_tokens: 3000,
          }),
        });
        const result = await response.json();
        return {
          index: idx, model: member.model, persona: member.persona || 'General',
          content: result.content || result.error || 'No response',
          tokens: result.tokens || { total: 0 }, cost_usd: result.cost_usd || 0,
          latency_ms: result.latency_ms || 0, success: !result.error,
        };
      } catch (e: any) {
        return { index: idx, model: member.model, success: false, content: e.message };
      }
    });

    const stage1 = await Promise.all(stage1Promises);
    const successfulResponses = stage1.filter(r => r.success);
    const chairmanModel = chairman_model || successfulResponses[0]?.model || 'google/gemini-2.5-pro';
    const synthesisResponse = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader!, 'apikey': supabaseKey },
      body: JSON.stringify({
        model: chairmanModel,
        messages: [{ role: 'user', content: `Sintetize: ${query}\n\nRespostas: ${successfulResponses.map(r => r.content).join('\n')}` }],
      }),
    });
    const synthesisResult = await synthesisResponse.json();

    return new Response(JSON.stringify({
      final_response: synthesisResult.content,
      stage1_results: stage1,
      metrics: {
        total_latency_ms: Date.now() - totalStartTime,
        total_cost_usd: stage1.reduce((s, r) => s + (r.cost_usd || 0), 0) + (synthesisResult.cost_usd || 0),
      }
    }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
