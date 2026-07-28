import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

type AuditAction =
  | 'agent.create' | 'agent.update' | 'agent.delete' | 'agent.deploy' | 'agent.duplicate'
  | 'kb.create' | 'kb.update' | 'kb.delete'
  | 'prompt.create' | 'prompt.activate'
  | 'secret.create' | 'secret.update' | 'secret.delete'
  | 'member.invite' | 'member.remove' | 'member.role_change'
  | 'auth.login' | 'auth.logout' | 'auth.password_change'
  | 'skill.threshold_calibrate';

type AuditEntityType =
  | 'agent'
  | 'knowledge_base'
  | 'prompt_version'
  | 'workspace_secret'
  | 'workspace_member'
  | 'auth'
  | 'skill_classifier';

interface AuditEntry {
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabaseExternal.rpc('log_audit_entry' as never, {
      p_action: entry.action,
      p_entity_type: entry.entity_type,
      p_entity_id: entry.entity_id ?? null,
      p_metadata: (entry.metadata ?? {}) as Json,
    } as never);

    if (error) {
      logger.warn('Failed to write audit log', { error: (error as { message: string }).message, action: entry.action });
    }
  } catch (err) {
    logger.warn('Audit logging failed silently', { error: String(err) });
  }
}

/** Convenience wrappers */
export const audit = {
  agentCreated: (id: string, name: string) =>
    logAudit({ action: 'agent.create', entity_type: 'agent', entity_id: id, metadata: { name } }),
  agentUpdated: (id: string, changes: string[]) =>
    logAudit({ action: 'agent.update', entity_type: 'agent', entity_id: id, metadata: { changes } }),
  agentDeleted: (id: string, name: string) =>
    logAudit({ action: 'agent.delete', entity_type: 'agent', entity_id: id, metadata: { name } }),
  agentDuplicated: (id: string, newId: string) =>
    logAudit({ action: 'agent.duplicate', entity_type: 'agent', entity_id: id, metadata: { newId } }),

  kbCreated: (id: string, name: string) =>
    logAudit({ action: 'kb.create', entity_type: 'knowledge_base', entity_id: id, metadata: { name } }),
  kbUpdated: (id: string) =>
    logAudit({ action: 'kb.update', entity_type: 'knowledge_base', entity_id: id }),
  kbDeleted: (id: string, name: string) =>
    logAudit({ action: 'kb.delete', entity_type: 'knowledge_base', entity_id: id, metadata: { name } }),

  promptCreated: (agentId: string, version: number) =>
    logAudit({ action: 'prompt.create', entity_type: 'prompt_version', entity_id: agentId, metadata: { version } }),
  promptActivated: (agentId: string, version: number) =>
    logAudit({ action: 'prompt.activate', entity_type: 'prompt_version', entity_id: agentId, metadata: { version } }),

  secretCreated: (keyName: string) =>
    logAudit({ action: 'secret.create', entity_type: 'workspace_secret', metadata: { keyName } }),
  secretDeleted: (keyName: string) =>
    logAudit({ action: 'secret.delete', entity_type: 'workspace_secret', metadata: { keyName } }),

  memberInvited: (email: string) =>
    logAudit({ action: 'member.invite', entity_type: 'workspace_member', metadata: { email } }),
  memberRemoved: (memberId: string) =>
    logAudit({ action: 'member.remove', entity_type: 'workspace_member', entity_id: memberId }),

  /**
   * Calibração do limiar de revisão departamental.
   *
   * Registrada porque o limiar muda quais skills entram na fila de curadoria:
   * sem trilha, uma queda de volume de revisões viraria mistério operacional.
   */
  skillThresholdCalibrated: (params: {
    from: number | null;
    to: number;
    sampleSize: number;
    accuracy: number | null;
    /**
     * `true` quando o curador confirmou a aplicação APESAR do detector de
     * instabilidade ter alertado. Sem essa marca, uma sequência de calibrações
     * ruidosas fica indistinguível de uma série saudável na trilha.
     */
    overriddenInstability?: boolean;
    instabilityReason?: 'volume' | 'oscilacao' | 'estavel';
    eventsInWindow?: number;
    reversals?: number;
  }) =>
    logAudit({
      action: 'skill.threshold_calibrate',
      entity_type: 'skill_classifier',
      metadata: {
        from: params.from,
        to: params.to,
        sample_size: params.sampleSize,
        accuracy: params.accuracy,
        origin: 'efficacy_card_suggestion',
        overridden_instability: params.overriddenInstability ?? false,
        instability_reason: params.instabilityReason ?? 'estavel',
        events_in_window: params.eventsInWindow ?? 0,
        reversals: params.reversals ?? 0,
      },
    }),
};
