import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  getCorsHeaders,
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
  authenticateRequest,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  parseBody,
  z,
} from '../_shared/mod.ts';

const LGPDInput = z.object({
  action: z.enum([
    'export_data',
    'delete_data',
    'request_deletion',
    'list_consents',
    'list_deletion_requests',
    'consent_grant',
    'consent_revoke',
    'revoke_consent',
    'anonymize',
  ]),
  target_user_id: z.string().uuid().optional(),
  scope: z.enum(['all', 'memories', 'sessions', 'traces', 'evaluations']).default('all'),
  consent_id: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
  purpose: z.string().optional(),
  legal_basis: z.string().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const auth = await authenticateRequest(req, { requireWorkspace: true });
    if (auth.error) return auth.error;
    const { user, supabaseAdmin, workspaceId } = auth;

    const identifier = getRateLimitIdentifier(req, user.id);
    const rateCheck = await checkRateLimit(identifier, RATE_LIMITS.heavy);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck, getCorsHeaders(req));

    const parsed = await parseBody(req, LGPDInput);
    if (parsed.error) return parsed.error;
    const { action, target_user_id, scope, consent_id, reason } = parsed.data;

    const targetId = target_user_id || user.id;

    // Log LGPD action for audit trail
    await supabaseAdmin.from('security_events').insert({
      event_type: `lgpd_${action}`,
      severity: action === 'delete_data' ? 'critical' : 'info',
      user_id: user.id,
      workspace_id: workspaceId,
      details: { target_user_id: targetId, scope, reason },
    });

    switch (action) {
      case 'export_data': {
        const exportData: Record<string, unknown> = {};
        const counts: Record<string, number> = {};

        if (scope === 'all' || scope === 'memories') {
          const { data } = await supabaseAdmin
            .from('agent_memories')
            .select('*')
            .eq('user_id', targetId)
            .limit(1000);
          exportData.memories = data || [];
          counts.memories = (data || []).length;
        }

        if (scope === 'all' || scope === 'sessions') {
          const { data } = await supabaseAdmin
            .from('sessions')
            .select('*')
            .eq('user_id', targetId)
            .limit(1000);
          exportData.sessions = data || [];
          counts.sessions = (data || []).length;
        }

        if (scope === 'all' || scope === 'traces') {
          const { data } = await supabaseAdmin
            .from('traces')
            .select('*')
            .eq('user_id', targetId)
            .limit(1000);
          exportData.traces = data || [];
          counts.traces = (data || []).length;
        }

        if (scope === 'all' || scope === 'evaluations') {
          const { data } = await supabaseAdmin
            .from('agent_eval_runs')
            .select('*')
            .eq('user_id', targetId)
            .limit(1000);
          exportData.evaluations = data || [];
          counts.evaluations = (data || []).length;
        }

        return jsonResponse(req, { action, user_id: targetId, data: exportData, counts });
      }

      case 'delete_data': {
        if (target_user_id && target_user_id !== user.id) {
          const { data: membership } = await supabaseAdmin
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', workspaceId)
            .eq('user_id', user.id)
            .maybeSingle();
          const role = String((membership as { role?: string } | null)?.role ?? '').toLowerCase();
          if (!['owner', 'admin', 'administrator'].includes(role)) {
            return errorResponse(
              req,
              'Apenas owner ou admin do workspace pode excluir dados de outro usuário.',
              403,
            );
          }
        }

        const deleted: Record<string, number> = {};
        if (scope === 'all' || scope === 'memories') {
          const { count } = await supabaseAdmin
            .from('agent_memories')
            .delete({ count: 'exact' })
            .eq('user_id', targetId);
          deleted.memories = count ?? 0;
        }
        if (scope === 'all' || scope === 'sessions') {
          const { count } = await supabaseAdmin
            .from('sessions')
            .delete({ count: 'exact' })
            .eq('user_id', targetId);
          deleted.sessions = count ?? 0;
        }
        if (scope === 'all' || scope === 'traces') {
          const { count } = await supabaseAdmin
            .from('traces')
            .delete({ count: 'exact' })
            .eq('user_id', targetId);
          deleted.traces = count ?? 0;
        }
        if (scope === 'all' || scope === 'evaluations') {
          const { count } = await supabaseAdmin
            .from('agent_eval_runs')
            .delete({ count: 'exact' })
            .eq('user_id', targetId);
          deleted.evaluations = count ?? 0;
        }

        const itemsDeleted = Object.values(deleted).reduce((acc, n) => acc + n, 0);
        const { data: record } = await supabaseAdmin
          .from('data_deletion_requests')
          .insert({
            user_id: targetId,
            workspace_id: workspaceId,
            scope,
            reason: reason || 'LGPD right to erasure',
            status: 'completed',
            completed_at: new Date().toISOString(),
            items_deleted: itemsDeleted,
          })
          .select('id')
          .maybeSingle();

        return jsonResponse(req, {
          action,
          request_id: (record as { id?: string } | null)?.id ?? null,
          deleted,
          items_deleted: itemsDeleted,
        });
      }

      case 'request_deletion': {
        const { data: created, error } = await supabaseAdmin
          .from('data_deletion_requests')
          .insert({
            user_id: targetId,
            workspace_id: workspaceId,
            scope,
            reason: reason || 'LGPD right to erasure',
            status: 'pending',
          })
          .select('id')
          .maybeSingle();
        if (error) {
          console.error('[lgpd-manager] falha ao registrar solicitação:', error);
          return errorResponse(req, 'Não foi possível registrar a solicitação', 500);
        }
        return jsonResponse(req, {
          action,
          request_id: (created as { id?: string } | null)?.id ?? null,
          status: 'pending',
          items_deleted: 0,
        });
      }

      case 'list_consents': {
        const { data } = await supabaseAdmin
          .from('consent_records')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false });
        return jsonResponse(req, { consents: data || [] });
      }

      case 'list_deletion_requests': {
        const { data } = await supabaseAdmin
          .from('data_deletion_requests')
          .select('*')
          .eq('user_id', targetId)
          .order('requested_at', { ascending: false });
        return jsonResponse(req, { requests: data || [] });
      }

      case 'revoke_consent':
      case 'consent_revoke': {
        if (!consent_id && !purpose) {
          return errorResponse(req, 'consent_id ou purpose é obrigatório', 400);
        }
        let revoke = supabaseAdmin
          .from('consent_records')
          .update({
            granted: false,
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', targetId);
        revoke = consent_id ? revoke.eq('id', consent_id) : revoke.eq('purpose', purpose as string);
        const { data: revoked, error } = await revoke.select('id');
        if (error) {
          console.error('[lgpd-manager] falha ao revogar consentimento:', error);
          return errorResponse(req, 'Não foi possível revogar o consentimento', 500);
        }
        return jsonResponse(req, {
          action,
          consent_id: consent_id ?? null,
          purpose: purpose ?? null,
          status: 'revoked',
          updated: (revoked || []).length,
        });
      }

      case 'consent_grant': {
        const { error } = await supabaseAdmin.from('consent_records').upsert(
          {
            user_id: targetId,
            workspace_id: workspaceId,
            purpose: purpose || 'general',
            consent_type: purpose || 'general',
            legal_basis: legal_basis || 'consent',
            granted: true,
            granted_at: new Date().toISOString(),
            revoked_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,purpose' },
        );
        if (error) {
          console.error('[lgpd-manager] falha ao registrar consentimento:', error);
          return errorResponse(req, 'Não foi possível registrar o consentimento', 500);
        }
        return jsonResponse(req, { action, status: 'granted' });
      }

      case 'anonymize': {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(targetId));
        const ref = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 16);
        const anonymized: Record<string, number> = {
          memories: 0,
          sessions: 0,
          deletion_requests: 0,
        };

        const { count: memCount, error: memError } = await supabaseAdmin
          .from('agent_memories')
          .update(
            { content: '[anonimizado]', metadata: { anonymized: true, ref } },
            { count: 'exact' },
          )
          .eq('user_id', targetId);
        if (memError) {
          console.error('[lgpd-manager] falha ao anonimizar memórias:', memError);
          return errorResponse(req, 'Não foi possível anonimizar as memórias', 500);
        }
        anonymized.memories = memCount ?? 0;

        const { count: sessCount, error: sessError } = await supabaseAdmin
          .from('sessions')
          .update({ metadata: { anonymized: true, ref } }, { count: 'exact' })
          .eq('user_id', targetId);
        if (sessError) {
          console.error('[lgpd-manager] falha ao anonimizar sessões:', sessError);
          return errorResponse(req, 'Não foi possível anonimizar as sessões', 500);
        }
        anonymized.sessions = sessCount ?? 0;

        const { count: reqCount } = await supabaseAdmin
          .from('data_deletion_requests')
          .update({ reason: `[anonimizado:${ref}]` }, { count: 'exact' })
          .eq('user_id', targetId);
        anonymized.deletion_requests = reqCount ?? 0;

        await supabaseAdmin.from('data_deletion_requests').insert({
          user_id: targetId,
          workspace_id: workspaceId,
          scope: 'all',
          reason: reason || 'LGPD anonymization',
          status: 'completed',
          completed_at: new Date().toISOString(),
          items_deleted: anonymized.memories + anonymized.sessions,
        });

        return jsonResponse(req, {
          action,
          status: 'completed',
          anonymized,
          ref,
        });
      }

      default:
        return errorResponse(req, 'Unknown action', 400);
    }
  } catch (error: unknown) {
    console.error('[lgpd-manager]', error);
    return errorResponse(req, 'Erro interno no gerenciador LGPD.', 500);
  }
});
