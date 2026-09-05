/**
 * agentsService — suíte migrada para o mock compartilhado do PostgREST.
 *
 * O mock raso anterior declarava manualmente `select/eq/gte/order/limit/maybeSingle`.
 * Isso deixava `getAgentFailures` sem cobertura possível: ele encadeia `.in(...)`,
 * método ausente do mock, então qualquer teste dessa função quebraria com
 * "chain.in is not a function" — falha do mock, não do serviço. Com
 * `getSharedSupabaseMock` a cadeia aceita qualquer elo do PostgREST, o que
 * permite cobrir o caminho de agregação alerts + traces e os caminhos de erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('agents-service').client };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const db = getSharedSupabaseMock('agents-service');

describe('agentsService', () => {
  beforeEach(() => {
    db.reset();
    db.setResult({ data: [], error: null });
  });

  describe('getAgentById', () => {
    it('retorna null quando o agente não existe', async () => {
      db.setTableResult('agents', { data: null, error: null });
      const { getAgentById } = await import('@/services/agentsService');

      expect(await getAgentById('nonexistent')).toBeNull();
      expect(db.calls.from).toHaveBeenCalledWith('agents');
      expect(db.calls.eq).toHaveBeenCalledWith('id', 'nonexistent');
      expect(db.calls.maybeSingle).toHaveBeenCalled();
    });

    it('propaga o erro do banco em vez de engolir', async () => {
      db.setTableResult('agents', { data: null, error: { message: 'DB error', code: '42501' } });
      const { getAgentById } = await import('@/services/agentsService');

      await expect(getAgentById('bad')).rejects.toMatchObject({ message: 'DB error' });
    });

    it('devolve o registro quando encontrado', async () => {
      db.setTableResult('agents', { data: { id: 'a1', name: 'Nexus' }, error: null });
      const { getAgentById } = await import('@/services/agentsService');

      expect(await getAgentById('a1')).toMatchObject({ id: 'a1', name: 'Nexus' });
    });
  });

  describe('getAgentDetailTraces', () => {
    it('ordena por created_at desc e aplica o limite informado', async () => {
      db.setTableResult('agent_traces', { data: [{ latency_ms: 120 }], error: null });
      const { getAgentDetailTraces } = await import('@/services/agentsService');

      const result = await getAgentDetailTraces('agent-1', 25);

      expect(result).toEqual([{ latency_ms: 120 }]);
      expect(db.calls.eq).toHaveBeenCalledWith('agent_id', 'agent-1');
      expect(db.calls.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(db.calls.limit).toHaveBeenCalledWith(25);
    });

    it('usa limite padrão de 50 quando omitido', async () => {
      const { getAgentDetailTraces } = await import('@/services/agentsService');
      await getAgentDetailTraces('agent-1');
      expect(db.calls.limit).toHaveBeenCalledWith(50);
    });

    it('devolve array vazio quando data é null', async () => {
      db.setTableResult('agent_traces', { data: null, error: null });
      const { getAgentDetailTraces } = await import('@/services/agentsService');
      expect(await getAgentDetailTraces('agent-1')).toEqual([]);
    });
  });

  describe('getAgentUsage', () => {
    it('calcula a janela de N dias como data ISO (YYYY-MM-DD)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
      try {
        const { getAgentUsage } = await import('@/services/agentsService');
        await getAgentUsage('agent-1', 30);
        // 2026-07-26 menos 30 dias = 2026-06-26
        expect(db.calls.gte).toHaveBeenCalledWith('date', '2026-06-26');
        expect(db.calls.order).toHaveBeenCalledWith('date');
      } finally {
        vi.useRealTimers();
      }
    });

    it('propaga erro do banco', async () => {
      db.setTableResult('agent_usage', { data: null, error: { message: 'timeout' } });
      const { getAgentUsage } = await import('@/services/agentsService');
      await expect(getAgentUsage('agent-1')).rejects.toMatchObject({ message: 'timeout' });
    });
  });

  describe('getAgentRecentAlerts', () => {
    it('respeita o limite explícito', async () => {
      const { getAgentRecentAlerts } = await import('@/services/agentsService');
      await getAgentRecentAlerts('agent-1', 10);
      expect(db.calls.from).toHaveBeenCalledWith('alerts');
      expect(db.calls.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('getAgentFailures', () => {
    it('funde alerts e traces, ordenando do mais recente para o mais antigo', async () => {
      db.setTableResult('alerts', {
        data: [
          {
            id: 'al-1',
            severity: 'critical',
            title: 'Fila travada',
            message: 'Backlog acima do limite',
            is_resolved: false,
            created_at: '2026-07-20T10:00:00.000Z',
          },
        ],
        error: null,
      });
      db.setTableResult('agent_traces', {
        data: [
          {
            id: 'tr-1',
            level: 'error',
            event: 'tool_call_failed',
            metadata: { error: 'HTTP 502 do provedor' },
            created_at: '2026-07-22T10:00:00.000Z',
          },
          {
            id: 'tr-2',
            level: 'warning',
            event: 'slow_response',
            metadata: {},
            created_at: '2026-07-18T10:00:00.000Z',
          },
        ],
        error: null,
      });

      const { getAgentFailures } = await import('@/services/agentsService');
      const failures = await getAgentFailures('agent-1');

      expect(failures.map((f) => f.id)).toEqual(['trace-tr-1', 'alert-al-1', 'trace-tr-2']);
      // metadata.error tem prioridade sobre o nome do evento
      expect(failures[0].message).toBe('HTTP 502 do provedor');
      // sem metadata útil, cai para o nome do evento
      expect(failures[2].message).toBe('slow_response');
      expect(failures[1]).toMatchObject({
        source: 'alert',
        category: 'critical',
        is_resolved: false,
      });
      // o filtro por níveis relevantes precisa existir — era impossível de testar antes
      expect(db.calls.in).toHaveBeenCalledWith('level', ['error', 'critical', 'warning']);
    });

    it('degrada com elegância quando ambas as consultas falham', async () => {
      db.setTableResult('alerts', { data: null, error: { message: 'rls' } });
      db.setTableResult('agent_traces', { data: null, error: { message: 'rls' } });

      const { getAgentFailures } = await import('@/services/agentsService');
      // não lança: a tabela de falhas do Agent Details deve renderizar vazia,
      // não derrubar a página inteira.
      expect(await getAgentFailures('agent-1')).toEqual([]);
    });
  });

  it('exporta a superfície pública esperada', async () => {
    const mod = await import('@/services/agentsService');
    for (const fn of [
      'getAgentById',
      'getAgentDetailTraces',
      'getAgentUsage',
      'getAgentRecentAlerts',
      'getAgentVersions',
      'getAgentFailures',
    ]) {
      expect(typeof mod[fn as keyof typeof mod]).toBe('function');
    }
  });
});
