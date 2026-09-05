/**
 * deploymentsService — cobertura comportamental sobre o mock compartilhado.
 *
 * O foco aqui é o `listDeployedAgents`, que faz um join manual em memória
 * entre `agents` e `deploy_connections`. Esse tipo de correlação client-side
 * é onde bugs silenciosos aparecem: canal desabilitado que continua aparecendo,
 * conexão órfã que sobrescreve o canal errado, ou contagem que vira `undefined`
 * e quebra o formatador na UI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('deploy-external').client };
});

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('deploy-local').client };
});

const ext = getSharedSupabaseMock('deploy-external');
const local = getSharedSupabaseMock('deploy-local');

describe('deploymentsService', () => {
  beforeEach(() => {
    ext.reset();
    local.reset();
    ext.setResult({ data: [], error: null });
    local.setResult({ data: [], error: null });
  });

  describe('listDeployments', () => {
    it('filtra pelo agente e ordena do mais recente para o mais antigo', async () => {
      ext.setTableResult('deploy_connections', {
        data: [{ id: 'd1', agent_id: 'a1', channel: 'widget' }],
        error: null,
      });
      const { listDeployments } = await import('@/services/deploymentsService');
      const rows = await listDeployments('a1');

      expect(rows).toHaveLength(1);
      expect(ext.calls.eq).toHaveBeenCalledWith('agent_id', 'a1');
      expect(ext.calls.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('propaga erro em vez de devolver lista vazia', async () => {
      ext.setTableResult('deploy_connections', { data: null, error: { message: 'rls' } });
      const { listDeployments } = await import('@/services/deploymentsService');
      await expect(listDeployments('a1')).rejects.toMatchObject({ message: 'rls' });
    });
  });

  describe('createDeployment', () => {
    it('exige sessão autenticada antes de tocar no banco', async () => {
      local.setUser(null);
      const { createDeployment } = await import('@/services/deploymentsService');
      await expect(createDeployment('a1', 'widget', {})).rejects.toThrow('Not authenticated');
      expect(ext.calls.insert).not.toHaveBeenCalled();
      expect(local.calls.insert).not.toHaveBeenCalled();
    });

    it('nasce com status active e preserva a config informada', async () => {
      ext.setTableResult('deploy_connections', { data: { id: 'd9' }, error: null });
      const { createDeployment } = await import('@/services/deploymentsService');
      await createDeployment('a1', 'slack', { channel_id: 'C123' });

      expect(ext.calls.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'a1',
          channel: 'slack',
          status: 'active',
          config: { channel_id: 'C123' },
        }),
      );
      // A escrita é dado: precisa ir para o banco externo, nunca para o de auth.
      expect(local.calls.insert).not.toHaveBeenCalled();
    });
  });

  describe('toggleDeployment', () => {
    it.each([
      [true, 'active'],
      [false, 'inactive'],
    ])('active=%s → status %s', async (active, expected) => {
      const { toggleDeployment } = await import('@/services/deploymentsService');
      await toggleDeployment('d1', active as boolean);
      expect(ext.calls.update).toHaveBeenCalledWith({ status: expected });
      expect(ext.calls.eq).toHaveBeenCalledWith('id', 'd1');
    });
  });

  describe('deleteDeployment', () => {
    it('remove pelo id e propaga erro', async () => {
      const { deleteDeployment } = await import('@/services/deploymentsService');
      await deleteDeployment('d1');
      expect(ext.calls.delete).toHaveBeenCalled();
      expect(ext.calls.eq).toHaveBeenCalledWith('id', 'd1');

      ext.setTableResult('deploy_connections', { data: null, error: { message: 'fk' } });
      await expect(deleteDeployment('d1')).rejects.toMatchObject({ message: 'fk' });
    });
  });

  describe('snippets', () => {
    it('gera o script do widget apontando para o agente correto', async () => {
      const { getWidgetSnippet, getApiEndpoint } = await import('@/services/deploymentsService');
      expect(getWidgetSnippet('a1')).toContain('/widget/a1.js');
      expect(getWidgetSnippet('a1')).toContain('async');
      expect(getApiEndpoint('a1')).toContain('/functions/v1/widget-proxy/chat');
    });
  });

  describe('listDeployedAgents', () => {
    const agents = [
      {
        id: 'a1',
        name: 'Atendimento',
        avatar_emoji: '🤖',
        status: 'production',
        version: 3,
        updated_at: '2026-07-25T10:00:00Z',
        config: {
          deploy_environment: 'staging',
          deploy_channels: [
            { channel: 'widget', name: 'Site', enabled: true },
            { channel: 'telegram', name: 'Telegram', enabled: false },
          ],
        },
      },
    ];

    it('correlaciona conexões vivas apenas com canais habilitados', async () => {
      ext.setTableResult('agents', { data: agents, error: null });
      ext.setTableResult('deploy_connections', {
        data: [
          {
            agent_id: 'a1',
            channel: 'widget',
            status: 'active',
            message_count: 42,
            last_message_at: '2026-07-25T09:00:00Z',
          },
          { agent_id: 'a1', channel: 'telegram', status: 'active', message_count: 999 },
        ],
        error: null,
      });
      const { listDeployedAgents } = await import('@/services/deploymentsService');
      const [row] = await listDeployedAgents();

      // canal desabilitado na config não pode vazar, mesmo tendo conexão viva
      expect(row.channels).toHaveLength(1);
      expect(row.channels[0]).toMatchObject({ name: 'Site', status: 'active', messages: 42 });
      expect(row.version).toBe('v3');
      expect(row.environment).toBe('staging');
      expect(ext.calls.in).toHaveBeenCalledWith('status', ['production', 'staging', 'monitoring']);
    });

    it('canal habilitado sem conexão viva aparece como inactive com zero mensagens', async () => {
      ext.setTableResult('agents', { data: agents, error: null });
      ext.setTableResult('deploy_connections', { data: [], error: null });
      const { listDeployedAgents } = await import('@/services/deploymentsService');
      const [row] = await listDeployedAgents();

      expect(row.channels[0]).toMatchObject({ status: 'inactive', messages: 0 });
      expect(row.channels[0].lastMsg).toBeUndefined();
    });

    it('não confunde conexões de outros agentes', async () => {
      ext.setTableResult('agents', { data: agents, error: null });
      ext.setTableResult('deploy_connections', {
        data: [{ agent_id: 'OUTRO', channel: 'widget', status: 'active', message_count: 500 }],
        error: null,
      });
      const { listDeployedAgents } = await import('@/services/deploymentsService');
      const [row] = await listDeployedAgents();

      expect(row.channels[0].messages).toBe(0);
      expect(row.channels[0].status).toBe('inactive');
    });

    it('usa environment production como padrão e tolera config nula', async () => {
      ext.setTableResult('agents', {
        data: [
          {
            id: 'a2',
            name: 'Sem config',
            avatar_emoji: null,
            status: 'production',
            version: 1,
            updated_at: 'x',
            config: null,
          },
        ],
        error: null,
      });
      ext.setTableResult('deploy_connections', { data: null, error: null });
      const { listDeployedAgents } = await import('@/services/deploymentsService');
      const [row] = await listDeployedAgents();

      expect(row.environment).toBe('production');
      expect(row.channels).toEqual([]);
    });

    it('propaga erro na consulta de agentes', async () => {
      ext.setTableResult('agents', { data: null, error: { message: 'timeout' } });
      const { listDeployedAgents } = await import('@/services/deploymentsService');
      await expect(listDeployedAgents()).rejects.toMatchObject({ message: 'timeout' });
    });
  });
});
