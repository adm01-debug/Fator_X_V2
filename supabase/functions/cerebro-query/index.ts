import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { fetchWithTimeout } from "../_shared/retry.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/mod.ts";
import { z } from "https://esm.sh/zod@3.23.8";

const CerebroBodySchema = z.object({
  query: z.string().trim().min(2).max(10000),
  stream: z.boolean().optional(),
  notebook_id: z.string().uuid().nullable().optional(),
  source_ids: z.array(z.string().uuid()).max(50).optional(),
}).passthrough();

const MAX_CITATIONS = 8;
const CITATIONS_SENTINEL = "\n\u241E";

interface Citation {
  n: number;
  chunk_id: string;
  document_id: string | null;
  document_title: string;
  page: number | null;
  section: string | null;
  snippet: string;
  notebook_id: string | null;
  notebook_name: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMeta(chunk: any): { page: number | null; section: string | null } {
  const md = chunk?.metadata ?? {};
  const page = typeof md.page === "number" ? md.page
    : typeof md.page_number === "number" ? md.page_number
    : null;
  const section = typeof md.section === "string" ? md.section
    : typeof md.heading === "string" ? md.heading
    : null;
  return { page, section };
}

function snippet(text: string, max = 180): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
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

    const rawBody = await req.json().catch(() => null);
    const parsedBody = CerebroBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorResponse('Payload inválido: ' + JSON.stringify(parsedBody.error.flatten().fieldErrors), 400, req);
    }
    const { query, stream: streamOpt, notebook_id: notebookId, source_ids: sourceIds } = parsedBody.data;
    const stream = streamOpt === true;

    await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id).limit(1).single();

    // ═══ Facts ═══
    const facts: string[] = [];
    const { count: agentCount } = await supabase.from('agents').select('id', { count: 'exact', head: true });
    if (agentCount) facts.push(`Temos ${agentCount} agentes configurados na plataforma`);
    const { count: kbCount } = await supabase.from('knowledge_bases').select('id', { count: 'exact', head: true });
    if (kbCount) facts.push(`Temos ${kbCount} bases de conhecimento`);
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const { count: traceCount } = await supabase.from('agent_traces').select('id', { count: 'exact', head: true }).gte('created_at', yesterday);
    if (traceCount) facts.push(`${traceCount} interações nas últimas 24h`);

    // Fetch active notebook name (if scoped)
    let activeNotebookName: string | null = null;
    if (notebookId) {
      const { data: nb } = await supabase.from('collections').select('name').eq('id', notebookId).maybeSingle();
      activeNotebookName = (nb?.name as string | undefined) ?? null;
      if (activeNotebookName) facts.push(`Busca escopada ao notebook "${activeNotebookName}"`);
    }

    // ═══ RAG with numbered citations (scoped by notebook when provided) ═══
    let ragBlock = '';
    let citations: Citation[] = [];
    let ragReranked = false;

    try {
      let chunkQuery = supabase
        .from('chunks')
        .select('id, content, metadata, document_id, documents(id, title, collection_id, collections(id, name))')
        .eq('embedding_status', 'done')
        .eq('is_active', true)
        .limit(15);

      if (notebookId) {
        // Isolation: only chunks whose metadata pins this notebook
        chunkQuery = chunkQuery.filter('metadata->>collection_id', 'eq', notebookId);
      }
      if (sourceIds && sourceIds.length > 0) {
        // NotebookLM-style: user restringiu o chat a fontes específicas
        chunkQuery = chunkQuery.in('document_id', sourceIds);
        facts.push(`Chat restrito a ${sourceIds.length} fontes selecionadas`);
      }
      const { data: chunks } = await chunkQuery;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let selected: any[] = chunks ?? [];

      if (selected.length > 0) {
        // Try rerank with metadata preserved
        try {
          const rerankUrl = `${supabaseUrl}/functions/v1/rag-rerank`;
          const rerankResp = await fetchWithTimeout(rerankUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': supabaseKey },
            body: JSON.stringify({ query, chunks: selected, top_k: MAX_CITATIONS }),
          });
          if (rerankResp.ok) {
            const rerankData = await rerankResp.json();
            if (rerankData.reranked?.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              selected = rerankData.reranked.map((r: any) => r.chunk ?? r);
              ragReranked = true;
            }
          }
        } catch { /* fallback: keep original */ }

        selected = selected.slice(0, MAX_CITATIONS);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        citations = selected.map((c: any, i: number): Citation => {
          const { page, section } = extractMeta(c);
          const doc = Array.isArray(c.documents) ? c.documents[0] : c.documents;
          const col = doc?.collections
            ? (Array.isArray(doc.collections) ? doc.collections[0] : doc.collections)
            : null;
          const metaCollectionId = (c.metadata && typeof c.metadata === 'object')
            ? (c.metadata.collection_id ?? null) : null;
          const metaNotebookName = (c.metadata && typeof c.metadata === 'object')
            ? (c.metadata.notebook_name ?? null) : null;
          return {
            n: i + 1,
            chunk_id: c.id,
            document_id: c.document_id ?? doc?.id ?? null,
            document_title: doc?.title ?? 'Documento sem título',
            page,
            section,
            snippet: snippet(c.content ?? ''),
            notebook_id: col?.id ?? metaCollectionId ?? doc?.collection_id ?? null,
            notebook_name: col?.name ?? metaNotebookName ?? null,
          };
        });

        ragBlock = citations
          .map((c) => {
            const meta = [
              `doc="${c.document_title}"`,
              c.page != null ? `p.${c.page}` : null,
              c.section ? `sec="${c.section}"` : null,
            ].filter(Boolean).join(', ');
            const body = (selected[c.n - 1]?.content ?? '').substring(0, 800);
            return `[${c.n}] (${meta})\n${body}`;
          })
          .join('\n---\n');
      }
    } catch { /* skip */ }

    const scopeNotice = activeNotebookName
      ? `Você está operando escopado ao notebook "${activeNotebookName}". Ignore qualquer conhecimento de outros notebooks.`
      : 'Você está operando em modo global (todos os notebooks visíveis).';

    const systemPromptRaw = `Você é o Super Cérebro da Promo Brindes — a inteligência central da empresa.
${scopeNotice}
Responda em português, com base no bloco RAG fornecido. Se não houver base suficiente, seja honesto e diga.

REGRA DE CITAÇÃO (obrigatória):
- Sempre que usar uma informação do bloco RAG, insira o marcador [n] (com o número exato da fonte) IMEDIATAMENTE após a frase correspondente.
- Você pode combinar fontes: "…texto [1][3]".
- NUNCA invente um número que não esteja no bloco RAG.
- Se responder sem usar o RAG, não inclua nenhum marcador.

Fatos internos: ${facts.join('; ') || 'nenhum'}

Bloco RAG:
${ragBlock || '(vazio — nenhuma fonte disponível)'}`;

    // Hard cap ~8k tokens (~32k chars) para evitar contexto explodir em notas grandes.
    const MAX_PROMPT_CHARS = 32000;
    const systemPrompt = systemPromptRaw.length > MAX_PROMPT_CHARS
      ? systemPromptRaw.slice(0, MAX_PROMPT_CHARS) + "\n\n[...prompt truncado por segurança]"
      : systemPromptRaw;

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

    if (stream && resp.body) {
      // Pipe upstream stream then append a sentinel + citations JSON at the end
      const encoder = new TextEncoder();
      const citationsPayload = JSON.stringify({ citations, rag_reranked: ragReranked });
      const tail = encoder.encode(CITATIONS_SENTINEL + citationsPayload);

      const transformed = resp.body.pipeThrough(new TransformStream({
        flush(controller) {
          controller.enqueue(tail);
        },
      }));

      return new Response(transformed, {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/event-stream' },
      });
    }

    const result = await resp.json();
    return jsonResponse({
      response: result.content || result.error,
      citations,
      facts_loaded: facts.length,
      rag_reranked: ragReranked,
      tokens: result.tokens,
      cost_usd: result.cost_usd,
    }, req);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return errorResponse(error.message, 500, req);
  }
});
