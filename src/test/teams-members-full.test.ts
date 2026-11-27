/**
 * Tela de time — leitura de membros (teamsService).
 *
 * Regressão coberta: o QA V6.1 moveu o PII de membros para
 * `workspace_member_emails` (RLS: `user_id = auth.uid()` ou `is_workspace_admin`),
 * revogou `workspace_members.email` e recriou `workspace_members_safe` **sem**
 * coluna de e-mail. Quem lê só a view mostra "—" para todos, inclusive para o
 * admin; quem lê a RPC `get_workspace_members_full` lê a coluna revogada e
 * perde os convites novos, que só gravam na tabela isolada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('teams-local').client };
});
vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('teams-external').client };
});

import { listMembersForTeam } from '@/services/teamsService';

const db = getSharedSupabaseMock('teams-external');

const viewRows = [
  { id: 'm1', workspace_id: 'ws1', user_id: 'u1', role: 'owner', name: 'Ana Souza', invited_at: null, accepted_at: null },
  { id: 'm2', workspace_id: 'ws1', user_id: 'u2', role: 'editor', name: 'Bruno Lima', invited_at: null, accepted_at: null },
];

beforeEach(() => {
  db.reset();
});

describe('listMembersForTeam', () => {
  it('mescla o e-mail da tabela isolada no membro correspondente', async () => {
    db.setTableResult('workspace_members_safe', { data: viewRows, error: null });
    db.setTableResult('workspace_member_emails', {
      data: [{ member_id: 'm1', email: 'ana@empresa.com' }],
      error: null,
    });

    await expect(listMembersForTeam('ws1')).resolves.toEqual([
      { ...viewRows[0], email: 'ana@empresa.com' },
      { ...viewRows[1], email: null },
    ]);
  });

  it('lê os e-mails escopados no workspace', async () => {
    db.setTableResult('workspace_members_safe', { data: viewRows, error: null });
    db.setTableResult('workspace_member_emails', { data: [], error: null });

    await listMembersForTeam('ws1');

    expect(db.calls.from).toHaveBeenCalledWith('workspace_member_emails');
    expect(db.calls.eq).toHaveBeenCalledWith('workspace_id', 'ws1');
  });

  it('não derruba a lista de membros quando a leitura de e-mail falha', async () => {
    db.setTableResult('workspace_members_safe', { data: viewRows, error: null });
    db.setTableResult('workspace_member_emails', {
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(listMembersForTeam('ws1')).resolves.toEqual([
      { ...viewRows[0], email: null },
      { ...viewRows[1], email: null },
    ]);
  });

  it('propaga erro da leitura principal (view de membros)', async () => {
    db.setTableResult('workspace_members_safe', {
      data: null,
      error: { message: 'relation does not exist' },
    });

    await expect(listMembersForTeam('ws1')).rejects.toMatchObject({
      message: 'relation does not exist',
    });
  });
});