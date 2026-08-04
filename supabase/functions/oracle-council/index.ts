import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { fetchWithTimeout } from '../_shared/retry.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders } from '../_shared/mod.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const CouncilBodySchema = z.object({
  query: z.string().trim().min(3).max(10_000),
  mode: z.enum(['council', 'researcher', 'validator', 'executor', 'advisor']).default('council'),
  members: z
    .array(z.object({ model: z.string().min(2), persona: z.string().optional() }))
    .min(2)
    .max(10),
  chairman_model: z.string().optional(),
  enable_peer_review: z.boolean().default(true),
  enable_thinking: z.boolean().default(false),
  preset_id: z.string().optional(),
  custom_guardrails: z.string().max(20_000).optional(),
});

// CORS handled by _shared/cors.ts — dynamic origin whitelist

// ═══ Rate Limiting (oracle is expensive — stricter in-process limit) ══════════
const oracleRateLimitMap = new Map<string, number[]>();
const ORACLE_RATE_LIMIT_MAX = 10; // 10 req/min per user
const ORACLE_RATE_LIMIT_WINDOW_MS = 60_000;

function oracleRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (oracleRateLimitMap.get(userId) || []).filter(
    (t) => now - t < ORACLE_RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= ORACLE_RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  oracleRateLimitMap.set(userId, timestamps);
  return true;
}

// Input validation via CouncilBodySchema (Zod) declared no topo do arquivo.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Rate limit
    if (!oracleRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Max 10 Oracle requests per minute.' }),
        {
          status: 429,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        },
      );
    }

    // Validate input with Zod
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const parsed = CouncilBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Payload inválido', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const {
      query,
      mode,
      members,
      chairman_model,
      enable_peer_review,
      enable_thinking,
      custom_guardrails,
    } = parsed.data;

    const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
    const totalStartTime = Date.now();

    // ═══ Guardrails & Mode Configuration ═══
    const buildSystemPrompt = (member: { model: string; persona?: string }) => {
      const thinkingInstructions = enable_thinking
        ? '\n\nAntes de dar sua resposta final, pense passo a passo:\n💭 Passo 1: Quais são os fatos relevantes?\n💭 Passo 2: Quais são as possíveis abordagens?\n💭 Passo 3: Quais são os riscos?\n💭 Passo 4: Minha recomendação e por quê?\n\nSepare claramente o raciocínio da resposta final usando "## Resposta" antes da resposta.'
        : '';

      const baseGuards = custom_guardrails
        ? `\n\nDiretrizes Específicas do Projeto:\n${custom_guardrails}`
        : '\n\nSiga estas regras rigorosamente:\n- Não forneça conselhos médicos, jurídicos ou financeiros sem ressalvas.\n- Mantenha tom profissional e objetivo.\n- Cite fontes sempre que possível.';

      const modeInstructions: Record<string, string> = {
        council: `Você é ${member.persona || 'um especialista'}. Seu objetivo é fornecer uma perspectiva única e técnica para um conselho de IAs. Responda de forma completa e fundamentada.${thinkingInstructions}${baseGuards}`,
        researcher: `Você é ${member.persona || 'um pesquisador sênior'}. Analise a questão com rigor acadêmico, cite dados, tendências e possíveis fontes de evidência. Estruture a resposta com seções claras.${thinkingInstructions}\n- Foco em objetividade, profundidade técnica e exaustão informativa.${baseGuards}`,
        validator: `Você é ${member.persona || 'um auditor de integridade'}. Verifique a veracidade da afirmação/pergunta. Classifique as alegações como: CONFIRMADO, DISPUTADO ou NÃO VERIFICADO. Apresente evidências a favor e contra cada ponto.${thinkingInstructions}\n- Seja extremamente cético, rigoroso e procure por vieses ou falácias.${baseGuards}`,
        executor: `Você é ${member.persona || 'um estrategista operacional'}. Decomponha a tarefa em sub-tarefas concretas, acionáveis e técnicas. Para cada sub-tarefa, indique: perfil executor sugerido, complexidade (1-10), e dependências críticas.${thinkingInstructions}\n- Foco total em pragmatismo, viabilidade e roadmap de execução.${baseGuards}`,
        advisor: `Você é ${member.persona || 'um conselheiro estratégico'}. Analise os trade-offs da decisão. Liste prós e contras multicritério (custo, tempo, risco, qualidade). Forneça uma recomendação clara com score de confiança.${thinkingInstructions}\n- Foco em análise multivariada, mitigação de riscos e visão de longo prazo.${baseGuards}`,
      };
      return modeInstructions[mode] || modeInstructions.council;
    };

    // ═══ STAGE 1: Parallel Polling (with Streaming) ═══
    const _stage1Start = Date.now();

    // Check if client wants streaming
    const isStream = req.headers.get('accept') === 'text/event-stream';

    if (isStream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      const sendUpdate = async (type: string, data: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      (async () => {
        try {
          await sendUpdate('stage', { stage: 1, label: 'Coletando opiniões...' });

          const stage1Promises = members.map(async (member, idx) => {
            const mStart = Date.now();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
            let result: any = null;
            let currentModel = member.model;

            // Failover models hierarchy (tier-based)
            const failoverModels = [
              'openai/gpt-4o',
              'anthropic/claude-3-5-sonnet',
              'google/gemini-1.5-pro',
              'meta-llama/llama-3.1-405b',
            ];

            const callGateway = async (model: string) => {
              const response = await fetchWithTimeout(gatewayUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: authHeader!,
                  apikey: supabaseKey,
                },
                body: JSON.stringify({
                  model: model,
                  messages: [
                    { role: 'system', content: buildSystemPrompt(member) },
                    { role: 'user', content: query },
                  ],
                  temperature: mode === 'validator' ? 0.3 : 0.7,
                  max_tokens: 3000,
                }),
              });
              if (!response.ok) throw new Error(`Gateway error: ${response.status}`);
              return await response.json();
            };

            try {
              result = await callGateway(currentModel);
            } catch (err) {
              console.error(`Model ${currentModel} failed, trying failover...`, err);
              // Simple failover to a reliable model
              currentModel = failoverModels.find((m) => m !== currentModel) || failoverModels[0];
              try {
                result = await callGateway(currentModel);
              } catch (err2) {
                console.error(`Failover to ${currentModel} also failed`, err2);
                return {
                  index: idx,
                  model: member.model,
                  success: false,
                  content: 'Erro persistente após failover',
                };
              }
            }

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
              index: idx,
              model: currentModel,
              original_model: member.model,
              persona: member.persona || 'General',
              content,
              thinking,
              tokens: result.tokens || { total: 0 },
              cost_usd: result.cost_usd || 0,
              latency_ms: Date.now() - mStart,
              success: !result.error,
              failover: currentModel !== member.model,
            };

            await sendUpdate('member_response', mResult);
            return mResult;
          });

          // Partial failure tolerance: allSettled evita que rejeição inesperada
          // (ex: sendUpdate crashando) derrube todo o fan-out.
          const settled = await Promise.allSettled(stage1Promises);
          const stage1 = settled.map((s, i) =>
            s.status === 'fulfilled'
              ? s.value
              : {
                  index: i,
                  model: members[i].model,
                  success: false,
                  content: `Falha inesperada: ${String((s as PromiseRejectedResult).reason).slice(0, 200)}`,
                },
          );
          const successfulResponses = stage1.filter((r) => r.success);
          const degraded = successfulResponses.length < members.length;

          if (successfulResponses.length < 2) {
            throw new Error('Membros insuficientes para quorum');
          }
          if (degraded) {
            await sendUpdate('degraded', {
              successful: successfulResponses.length,
              total: members.length,
            });
          }

          // STAGE 2: Peer Review
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
          let stage2Results: any[] = [];
          if (enable_peer_review) {
            await sendUpdate('stage', { stage: 2, label: 'Realizando Peer-Review...' });
            const _anonymized = successfulResponses
              .map((r, i) => `## Resposta ${String.fromCharCode(65 + i)}\n${r.content}`)
              .join('\n\n---\n\n');
            const reviewPrompt = `Pergunta: "${query}"\n\nAvalie as respostas anônimas acima. Identifique pontos de consenso e divergências. Cite especificamente "Resposta A", "Resposta B", etc.\n\nResponda APENAS em JSON válido com este formato: {"consensus_degree": number, "consensus_points": [{"claim": string, "category": "fact"|"opinion", "consensusLevel": "strong"|"partial"|"disputed"}], "divergences": [string]}`;

            const reviewModel = chairman_model || successfulResponses[0].model;
            const reviewResponse = await fetchWithTimeout(gatewayUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader!,
                apikey: supabaseKey,
              },
              body: JSON.stringify({
                model: reviewModel,
                messages: [
                  {
                    role: 'system',
                    content: 'Você é um avaliador imparcial e crítico. Responda SOMENTE em JSON.',
                  },
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
            } catch (e) {
              console.error('Stage 2 JSON Error', e);
            }
          }

          // STAGE 3: Synthesis
          await sendUpdate('stage', { stage: 3, label: 'Presidente sintetizando veredito...' });
          const chairmanModel = chairman_model || successfulResponses[0].model;
          const reviewData = stage2Results[0] || {};
          const synthesisPrompt = `Pergunta: "${query}"\n\nRespostas do Conselho:\n${successfulResponses.map((r, i) => `[Membro ${i + 1} (${r.model})]: ${r.content}`).join('\n\n---\n\n')}\n\nAnálise de Consenso:\n${JSON.stringify(reviewData)}\n\nSintetize a resposta final. Use citações inline como [Membro 1] para atribuir ideias. Garanta que divergências sejam apresentadas de forma neutra. Use Markdown estruturado.`;

          const synthesisResponse = await fetchWithTimeout(gatewayUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader!,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              model: chairmanModel,
              messages: [
                {
                  role: 'system',
                  content:
                    'Você é o Chairman do Oráculo. Sua missão é criar um veredito equilibrado e fundamentado.',
                },
                { role: 'user', content: synthesisPrompt },
              ],
              temperature: 0.4,
            }),
          });
          const synthesisResult = await synthesisResponse.json();
          const finalContent = synthesisResult.content || '';

          await sendUpdate('final', {
            final_response: finalContent,
            confidence_score: Math.round(
              (reviewData.consensus_degree || 85) * 0.9 +
                (successfulResponses.length / members.length) * 10,
            ),
            consensus_degree: reviewData.consensus_degree || 75,
            consensus_points: reviewData.consensus_points || [],
            degraded,
            metrics: {
              total_latency_ms: Date.now() - totalStartTime,
              total_cost_usd:
                stage1.reduce((s, r) => s + (r.cost_usd || 0), 0) + (synthesisResult.cost_usd || 0),
              total_tokens:
                stage1.reduce((s, r) => s + (r.tokens?.total || 0), 0) +
                (synthesisResult.tokens?.total || 0),
              models_used: successfulResponses.length,
              models_failed: members.length - successfulResponses.length,
            },
          });
          await writer.close();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        } catch (err: any) {
          await sendUpdate('error', err.message);
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // --- Legacy Sync Flow ---
    const stage1Promises = members.map(async (member, idx) => {
      try {
        const response = await fetchWithTimeout(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader!,
            apikey: supabaseKey,
          },
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
          index: idx,
          model: member.model,
          persona: member.persona || 'General',
          content: result.content || result.error || 'No response',
          tokens: result.tokens || { total: 0 },
          cost_usd: result.cost_usd || 0,
          latency_ms: result.latency_ms || 0,
          success: !result.error,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
      } catch (e: any) {
        return { index: idx, model: member.model, success: false, content: e.message };
      }
    });

    const settledLegacy = await Promise.allSettled(stage1Promises);
    const stage1 = settledLegacy.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : {
            index: i,
            model: members[i].model,
            success: false,
            content: `Falha inesperada: ${String((s as PromiseRejectedResult).reason).slice(0, 200)}`,
          },
    );
    const successfulResponses = stage1.filter((r) => r.success);
    const degraded = successfulResponses.length < members.length;
    const chairmanModel =
      chairman_model || successfulResponses[0]?.model || 'google/gemini-2.5-pro';
    const synthesisResponse = await fetchWithTimeout(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader!,
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        model: chairmanModel,
        messages: [
          {
            role: 'user',
            content: `Sintetize: ${query}\n\nRespostas: ${successfulResponses.map((r) => r.content).join('\n')}`,
          },
        ],
      }),
    });
    const synthesisResult = await synthesisResponse.json();

    return new Response(
      JSON.stringify({
        final_response: synthesisResult.content,
        stage1_results: stage1,
        degraded,
        metrics: {
          total_latency_ms: Date.now() - totalStartTime,
          total_cost_usd:
            stage1.reduce((s, r) => s + (r.cost_usd || 0), 0) + (synthesisResult.cost_usd || 0),
          models_used: successfulResponses.length,
          models_failed: members.length - successfulResponses.length,
        },
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      },
    );
  }
});
