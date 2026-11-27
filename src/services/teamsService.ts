/**
 * Nexus Agents Studio — Teams Service
 * Workspace member management, invitations.
 */
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { supabase } from '@/integrations/supabase/client';
import type { RoleKey } from './rbacService';

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  accepted_at: string | null;
  invited_at: string | null;
  [key: string]: unknown;
}

export interface PendingInviteRow {
  id: string;
  workspace_id: string;
  email: string | null;
  role: string | null;
  invited_at: string | null;
  [key: string]: unknown;
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const { data, error } = await supabaseExternal
    .from('workspace_members_safe')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('invited_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as WorkspaceMemberRow[];
}

/**
 * E-mails dos membros — `workspace_member_emails` é a fonte da verdade desde o
 * QA V6.1: o hardening P0 revogou `workspace_members.email`, copiou os e-mails
 * para essa tabela isolada e `invite_workspace_member` passou a gravar só nela.
 * A RLS entrega o e-mail de todos ao admin/owner e apenas o próprio aos demais.
 */
async function listMemberEmails(workspaceId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseExternal
    .from('workspace_member_emails')
    .select('member_id, email')
    .eq('workspace_id', workspaceId);

  // Sem e-mail a lista de membros continua útil: não derruba a tela de time.
  if (error) return new Map();

  return new Map(
    ((data ?? []) as Array<{ member_id: string; email: string }>).map((row) => [
      row.member_id,
      row.email,
    ]),
  );
}

/**
 * Leitura da tela de time: nomes e papéis vêm da view `workspace_members_safe`
 * e os e-mails da tabela isolada, cujo RLS decide quem vê o quê. A RPC
 * `get_workspace_members_full` é anterior à tabela isolada e lê a coluna
 * revogada, então não serve como fonte de e-mail.
 */
export async function listMembersForTeam(workspaceId: string): Promise<WorkspaceMemberRow[]> {
  const members = await listMembers(workspaceId);
  const emails = await listMemberEmails(workspaceId);

  return members.map((member) => ({
    ...member,
    email: emails.get(member.id) ?? member.email ?? null,
  }));
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: RoleKey = 'agent_viewer',
  name?: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Atomic RPC: creates member + isolated email row, with admin check.
  const { error } = await supabaseExternal.rpc('invite_workspace_member', {
    p_workspace_id: workspaceId,
    p_email: email,
    p_role: role,
    p_name: name ?? undefined,
    p_user_id: undefined,
  });
  if (error) throw error;

  return { invited: true, email, role, workspace_id: workspaceId };
}

export async function removeMember(workspaceId: string, userId: string) {
  const { error } = await supabaseExternal
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getPendingInvites(email: string) {
  // Após o hardening P0, `email` não é mais legível diretamente.
  // RPC valida que o solicitante é dono do email antes de retornar.
  const { data, error } = await supabaseExternal.rpc('get_pending_invites_for_email', {
    _email: email,
  });
  if (error) throw error;
  return data ?? [];
}

export async function acceptInvite(memberId: string) {
  const { error } = await supabaseExternal.rpc('accept_workspace_invitation', { p_member_id: memberId });
  if (error) throw error;
}

export async function updateMemberRole(workspaceId: string, userId: string, newRole: RoleKey) {
  const { error } = await supabaseExternal
    .from('workspace_members')
    .update({ role: newRole })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function insertWorkspaceMember(member: {
  workspace_id: string;
  email: string;
  role: string;
  name?: string;
  user_id?: string;
}) {
  // Delegates to RPC so the email is written to the isolated PII table.
  const { error } = await supabaseExternal.rpc('invite_workspace_member', {
    p_workspace_id: member.workspace_id,
    p_email: member.email,
    p_role: member.role,
    p_name: member.name ?? undefined,
    p_user_id: member.user_id ?? undefined,
  });
  if (error) throw error;
}
