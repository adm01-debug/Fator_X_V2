/**
 * doc-rechunk — Re-chunk and re-embed an existing document with new settings,
 * preserving historical chunks so past citations stay resolvable.
 *
 * Auth: JWT (via authenticateRequest). RLS on documents/chunks + service_role
 *       ownership check via collections → knowledge_bases → workspace_members.
 *
 * Behavior:
 *   1. Reads current documents row (must have parsed_text, or storage_path to re-parse fallback).
 *   2. Marks all existing chunks for this document as is_active = false (kept for history).
 *   3. Bumps chunk_version, generates new chunks with the requested strategy/size/overlap.
 *   4. Inserts new active chunks with embedding_status='pending' + is_active=true.
 *   5. Fires rag-embed-backfill in the background.
 *
 * Input:
 *   {
 *     document_id: uuid,
 *     chunk_size?: number (200-4000, default keeps existing),
 *     chunk_overlap?: number (>=0 and < chunk_size, default keeps existing),
 *     chunk_strategy?: 'fixed'|'paragraph'|'sentence' (default keeps existing),
 *   }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  handleCorsPreflight, jsonResponse, errorResponse, getCorsHeaders,
  authenticateRequest,
  checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
  parseBody, z,
} from "../_shared/mod.ts";
import { chunkText, normalizeChunkOptions } from "../_shared/chunker.ts";

const Input = z.object({
  document_id: z.string().uuid(),
  chunk_size: z.number().int().min(200).max(4000).optional(),
  chunk_overlap: z.number().int().min(0).max(3999).optional(),
  chunk_strategy: z.enum(['fixed', 'paragraph', 'sentence']).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  const cors = getCorsHeaders(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user } = auth;

    const rate = checkRateLimit(getRateLimitIdentifier(req, user.id), RATE_LIMITS.moderate);
    if (!rate.allowed) return createRateLimitResponse(rate);

    const parsed = await parseBody(req, Input);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Ownership check via workspace membership
    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .select(`
        id, title, chunk_size, chunk_overlap, chunk_strategy, chunk_version,
        parsed_text, source_url, mime_type, collection_id, metadata,
        collections!inner (
          id, name,
          knowledge_bases!inner (
            id, workspace_id,
            workspace_members:workspaces!inner ( id )
          )
        )
      `)
      .eq('id', body.document_id)
      .maybeSingle();

    if (docErr || !doc) return errorResponse(req, 'Documento não encontrado', 404);

    // Verify user has access to the workspace
    // deno-lint-ignore no-explicit-any
    const wsId = (doc as any).collections?.knowledge_bases?.workspace_id as string | undefined;
    if (!wsId) return errorResponse(req, 'Documento sem workspace', 403);

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership) return errorResponse(req, 'Sem permissão para este documento', 403);

    if (!doc.parsed_text || doc.parsed_text.length < 20) {
      return errorResponse(
        req,
        'Documento sem texto parseado salvo. Reenvie o arquivo para poder re-chunkar.',
        409,
      );
    }

    const nextOpts = normalizeChunkOptions({
      size: body.chunk_size ?? doc.chunk_size,
      overlap: body.chunk_overlap ?? doc.chunk_overlap,
      strategy: (body.chunk_strategy ?? doc.chunk_strategy) as 'fixed' | 'paragraph' | 'sentence',
    });

    // If nothing actually changes, short-circuit
    if (
      nextOpts.size === doc.chunk_size &&
      nextOpts.overlap === doc.chunk_overlap &&
      nextOpts.strategy === doc.chunk_strategy
    ) {
      return jsonResponse({
        status: 'noop',
        message: 'Configurações idênticas às atuais — nada a fazer',
        chunk_version: doc.chunk_version,
      });
    }

    const nextVersion = (doc.chunk_version ?? 1) + 1;

    // Archive current active chunks (keep row for historical citations)
    const { error: archiveErr } = await supabase
      .from('chunks')
      .update({ is_active: false })
      .eq('document_id', doc.id)
      .eq('is_active', true);
    if (archiveErr) {
      return errorResponse(req, `Falha ao arquivar chunks anteriores: ${archiveErr.message}`, 500);
    }

    const newChunks = chunkText(doc.parsed_text, nextOpts);
    if (newChunks.length === 0) {
      return errorResponse(req, 'Rechunk gerou zero blocos — cheque estratégia/tamanho', 422);
    }

    const notebookName =
      // deno-lint-ignore no-explicit-any
      ((doc as any).collections?.name as string | undefined) ?? null;
    // deno-lint-ignore no-explicit-any
    const meta = (doc.metadata ?? {}) as any;

    const rows = newChunks.map((content, i) => ({
      document_id: doc.id,
      content,
      chunk_index: i,
      embedding_status: 'pending',
      token_count: Math.ceil(content.length / 4),
      chunk_version: nextVersion,
      is_active: true,
      metadata: {
        filename: meta.filename ?? doc.title,
        extraction_method: meta.extraction_method ?? null,
        collection_id: doc.collection_id,
        notebook_name: notebookName,
        chunk_strategy: nextOpts.strategy,
        chunk_size: nextOpts.size,
        chunk_overlap: nextOpts.overlap,
        rechunked_at: new Date().toISOString(),
      },
    }));

    const { error: insErr } = await supabase.from('chunks').insert(rows);
    if (insErr) {
      // rollback: reactivate previous
      await supabase
        .from('chunks')
        .update({ is_active: true })
        .eq('document_id', doc.id)
        .eq('chunk_version', doc.chunk_version);
      return errorResponse(req, `Falha ao inserir novos chunks: ${insErr.message}`, 500);
    }

    await supabase
      .from('documents')
      .update({
        chunk_size: nextOpts.size,
        chunk_overlap: nextOpts.overlap,
        chunk_strategy: nextOpts.strategy,
        chunk_version: nextVersion,
        status: 'processing',
      })
      .eq('id', doc.id);

    // Audit event (best-effort)
    await supabase.from('audit_events').insert({
      user_id: user.id,
      workspace_id: wsId,
      event_type: 'document.rechunk',
      resource_type: 'document',
      resource_id: doc.id,
      action: 'rechunk',
      metadata: {
        from: { size: doc.chunk_size, overlap: doc.chunk_overlap, strategy: doc.chunk_strategy, version: doc.chunk_version },
        to: { ...nextOpts, version: nextVersion },
        chunks_created: rows.length,
      },
    }).then(() => {}, () => {});

    // Fire embeddings in background
    supabase.functions.invoke('rag-embed-backfill', {
      body: { document_id: doc.id },
    }).catch(() => {});

    return jsonResponse({
      status: 'ok',
      document_id: doc.id,
      chunk_version: nextVersion,
      chunks_created: rows.length,
      settings: nextOpts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
