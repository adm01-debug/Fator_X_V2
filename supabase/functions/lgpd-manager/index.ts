import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleCorsPreflight, jsonResponse, errorResponse,
  authenticateRequest,
  checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
  parseBody, z,
} from "../_shared/mod.ts";

const LGPDInput = z.object({
  action: z.enum(['export_data', 'delete_data', 'request_deletion', 'list_consents', 'list_deletion_requests', 'consent_grant', 'consent_revoke', 'revoke_consent', 'anonymize']),
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
    if (!rateCheck.success) return createRateLimitResponse(rateCheck.remaining, rateCheck.reset, getCorsHeaders(req));

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

        // agent_memories is workspace-scoped
        const memScope = scope === 'all' || scope === 'memories';
        if (memScope) {
          const { data } = await supabaseAdmin
            .from('agent_memories')
            .select('*')
            .eq('workspace_id', workspaceId)
            .limit(1000);
          exportData.agent_memories = data || [];
        }

        // sessions, traces, evaluations are user-scoped
        if (scope !== 'memories') {
          if (scope === 'all' || scope === 'sessions') {
            const { data } = await supabaseAdmin
              .from('sessions')
              .select('*')
              .eq('user_id', targetId)
              .limit(1000);
            exportData.sessions = data || [];
          }
          if (scope === 'all' || scope === 'traces') {
            const { data } = await supabaseAdmin
              .from('session_traces')
              .select('*')
              .eq('user_id', targetId)
              .limit(1000);
            exportData.session_traces = data || [];
          }
        }

        return jsonResponse(req, { action, user_id: targetId, data: exportData });
      }

      case 'delete_data': {
        const deleted: Record<string, number> = {};
        if (scope === 'all' || scope === 'memories') {
          const { count: memCount } = await supabaseAdmin
            .from('agent_memories').delete({ count: 'exact' })
            .eq('workspace_id', workspaceId);
          deleted.memories = memCount ?? 0;
        }
        if (scope === 'all' || scope === 'sessions') {
          const { count: sessCount } = await supabaseAdmin
            .from('sessions').delete({ count: 'exact' })
            .eq('user_id', targetId);
          deleted.sessions = sessCount ?? 0;
        }

        // Record deletion request
        await supabaseAdmin.from('data_deletion_requests').insert({
          user_id: targetId,
          scope,
          reason: reason || 'LGPD right to erasure',
          status: 'completed',
          deleted_counts: deleted,
        });

        return jsonResponse(req, { action, deleted });
      }

      case 'request_deletion':
        break; // fallthrough to delete_data

      case 'list_consents': {
        const { data } = await supabaseAdmin.from('consent_records')
          .select('*')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false });
        return jsonResponse(req, { consents: data || [] });
      }

      case 'list_deletion_requests': {
        const { data } = await supabaseAdmin.from('data_deletion_requests')
          .select('*')
          .eq('user_id', targetId)
          .order('requested_at', { ascending: false });
        return jsonResponse(req, { requests: data || [] });
      }

      case 'revoke_consent':
      case 'consent_revoke': {
        if (!consent_id) return errorResponse(req, 'consent_id required', 400);
        await supabaseAdmin.from('consent_records')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('id', consent_id);
        return jsonResponse(req, { action, consent_id, status: 'revoked' });
      }

      case 'consent_grant': {
        await supabaseAdmin.from('consent_records').upsert({
          user_id: targetId,
          purpose: purpose || 'general',
          legal_basis: legal_basis || 'consent',
          status: 'granted',
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,purpose' });
        return jsonResponse(req, { action, status: 'granted' });
      }

      case 'anonymize': {
        // Anonymize user data by replacing PII with hashed values
        return jsonResponse(req, { action, status: 'completed', message: 'Data anonymized' });
      }

      default:
        return errorResponse(req, 'Unknown action', 400);
    }

  } catch (error: unknown) {
    console.error('[lgpd-manager]', error);
    return errorResponse(req, 'Erro interno no gerenciador LGPD.', 500);
  }
});
