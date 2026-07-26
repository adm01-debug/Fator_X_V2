/**
 * workspaceContextService — migrado para o mock compartilhado.
 *
 * A versão anterior reconstruía um builder raso a cada teste (`buildResolver`),
 * que só sobrevivia enquanto a cadeia fosse exatamente `select→eq→limit→
 * maybeSingle`. Qualquer elo novo no serviço quebraria a suíte com um
 * "not a function" sem relação com o comportamento testado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('workspace-context').client };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  getWorkspaceIdForUser,
  getFirstWorkspaceId,
  isWorkspaceOwner,
  getCurrentUserWorkspace,
} from '@/services/workspaceContextService';

const db = getSharedSupabaseMock('workspace-context');

/** Resultado da consulta a `workspaces` para o cenário em teste. */
function whenWorkspace(payload: { data: unknown; error: unknown }) {
  db.setTableResult('workspaces', payload as { data: unknown; error: { message: string } | null });
}

describe('workspaceContextService', () => {
  beforeEach(() => {
    db.reset();
    db.setResult({ data: null, error: null });
  });

  describe('getWorkspaceIdForUser', () => {
    it('devolve o id do workspace quando encontrado', async () => {
      whenWorkspace({ data: { id: 'ws-1' }, error: null });
      expect(await getWorkspaceIdForUser('user-1')).toBe('ws-1');
      expect(db.calls.from).toHaveBeenCalledWith('workspaces');
      expect(db.calls.eq).toHaveBeenCalledWith('owner_id', 'user-1');
    });

    it('devolve null quando o usuário não possui workspace', async () => {
      whenWorkspace({ data: null, error: null });
      expect(await getWorkspaceIdForUser('user-1')).toBeNull();
    });

    it('lança quando o banco recusa a leitura', async () => {
      whenWorkspace({ data: null, error: { message: 'rls denied' } });
      await expect(getWorkspaceIdForUser('user-1')).rejects.toBeDefined();
    });
  });

  describe('getFirstWorkspaceId', () => {
    it('devolve o primeiro workspace disponível', async () => {
      whenWorkspace({ data: { id: 'ws-first' }, error: null });
      expect(await getFirstWorkspaceId()).toBe('ws-first');
    });

    it('devolve null quando não há workspaces', async () => {
      whenWorkspace({ data: null, error: null });
      expect(await getFirstWorkspaceId()).toBeNull();
    });
  });

  describe('isWorkspaceOwner', () => {
    it('true quando owner_id confere', async () => {
      whenWorkspace({ data: { owner_id: 'user-1' }, error: null });
      expect(await isWorkspaceOwner('ws-1', 'user-1')).toBe(true);
    });

    it('false quando owner_id diverge — barra escalonamento de privilégio', async () => {
      whenWorkspace({ data: { owner_id: 'user-2' }, error: null });
      expect(await isWorkspaceOwner('ws-1', 'user-1')).toBe(false);
    });

    it('false quando o workspace não existe', async () => {
      whenWorkspace({ data: null, error: null });
      expect(await isWorkspaceOwner('ws-x', 'user-1')).toBe(false);
    });
  });

  describe('getCurrentUserWorkspace', () => {
    it('devolve null sem usuário autenticado', async () => {
      db.setUser(null);
      expect(await getCurrentUserWorkspace()).toBeNull();
    });

    it('devolve o resumo do workspace do usuário autenticado', async () => {
      whenWorkspace({ data: { id: 'ws-1', name: 'Promo' }, error: null });
      expect(await getCurrentUserWorkspace()).toEqual({ id: 'ws-1', name: 'Promo' });
    });
  });
});
