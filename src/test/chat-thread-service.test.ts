/**
 * chatThreadService — persistência de conversas do AgentTalk.
 *
 * ## Por que estes testes existem
 *
 * A migração de `localStorage` para Postgres criou três caminhos onde um
 * erro é silencioso e destrutivo:
 *
 *  1. `migrateLegacyLocalHistory` roda uma vez por navegador. Se a guarda
 *     de idempotência falhar, o usuário ganha o histórico duplicado — e
 *     duplicado *dentro* do prompt enviado ao modelo, encarecendo e
 *     degradando cada resposta seguinte.
 *  2. `fetchMessages` busca DESC (para pegar as N mais recentes) e precisa
 *     inverter. Esquecer o `.reverse()` embaralha a conversa inteira sem
 *     lançar erro algum.
 *  3. Todo IO é `try/catch` com degradação silenciosa. Isso é intencional,
 *     mas significa que uma regressão não aparece como exceção — só como
 *     dado errado. Daí a necessidade de asserção explícita.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/externalClient', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabaseExternal: m.getSharedSupabaseMock('chatThread').client };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  fetchMessages,
  getOrCreateThread,
  migrateLegacyLocalHistory,
} from '@/services/chatThreadService';

const db = getSharedSupabaseMock('chatThread');
const LEGACY_FLAG = 'nexus:chat:migrated:v2';

describe('chatThreadService — ordenação do histórico', () => {
  beforeEach(() => {
    db.reset();
    db.setUser({ id: 'u-1' });
    localStorage.clear();
  });

  it('mapeia attachments JSONB para a UI quando existem', async () => {
    db.setTableResult('chat_messages', {
      data: [
        {
          id: 'm1',
          role: 'user',
          content: 'veja o anexo',
          failed: false,
          created_at: '2026-01-01T00:00:01Z',
          attachments: [
            {
              name: 'relatorio.pdf',
              size: 1024,
              mime: 'application/pdf',
              storagePath: 'u-1/t-1/0-relatorio.pdf',
            },
            { name: 'nao.pdf', size: 999, mime: 'duvida', storagePath: 42 },
          ],
        },
      ],
      error: null,
    });

    const [msg] = await fetchMessages('t-1');

    expect(msg.attachments).toHaveLength(2);
    expect(msg.attachments?.[0]).toEqual({
      name: 'relatorio.pdf',
      size: 1024,
      mime: 'application/pdf',
      storagePath: 'u-1/t-1/0-relatorio.pdf',
      url: undefined,
    });
    // storagePath numérico inválido não quebra o mapeamento.
    expect(msg.attachments?.[1].storagePath).toBeUndefined();
  });

  it('deixa attachments undefined quando a coluna vem nula', async () => {
    db.setTableResult('chat_messages', {
      data: [
        {
          id: 'm1',
          role: 'user',
          content: 'sem anexo',
          failed: false,
          created_at: '2026-01-01T00:00:01Z',
          attachments: null,
        },
      ],
      error: null,
    });

    const [msg] = await fetchMessages('t-1');

    expect(msg.attachments).toBeUndefined();
  });

  it('devolve as mensagens em ordem cronológica ainda que o banco responda DESC', async () => {
    // O serviço consulta `order(created_at, desc)` + `limit` para pegar as
    // mais recentes; a UI precisa do inverso.
    db.setTableResult('chat_messages', {
      data: [
        {
          id: 'm3',
          role: 'assistant',
          content: 'terceira',
          failed: false,
          created_at: '2026-01-01T00:00:03Z',
        },
        {
          id: 'm2',
          role: 'user',
          content: 'segunda',
          failed: false,
          created_at: '2026-01-01T00:00:02Z',
        },
        {
          id: 'm1',
          role: 'user',
          content: 'primeira',
          failed: false,
          created_at: '2026-01-01T00:00:01Z',
        },
      ],
      error: null,
    });

    const msgs = await fetchMessages('t-1');

    expect(msgs.map((m) => m.content)).toEqual(['primeira', 'segunda', 'terceira']);
    expect(msgs[0].timestamp).toBeLessThan(msgs[2].timestamp);
  });

  it('mapeia papéis desconhecidos para assistant, já que a bolha só renderiza dois papéis', async () => {
    db.setTableResult('chat_messages', {
      data: [
        {
          id: 's1',
          role: 'system',
          content: 'ctx',
          failed: false,
          created_at: '2026-01-01T00:00:01Z',
        },
      ],
      error: null,
    });

    const [msg] = await fetchMessages('t-1');

    expect(msg.role).toBe('assistant');
  });

  it('degrada para lista vazia em erro de rede, sem propagar exceção', async () => {
    db.setTableResult('chat_messages', { data: null, error: { message: 'network down' } });

    await expect(fetchMessages('t-1')).resolves.toEqual([]);
  });
});

describe('chatThreadService — resolução de thread', () => {
  beforeEach(() => {
    db.reset();
    db.setUser({ id: 'u-1' });
    localStorage.clear();
  });

  it('não cria thread quando não há sessão — evita insert que a RLS rejeitaria', async () => {
    db.setUser(null);

    const thread = await getOrCreateThread('a-1');

    expect(thread).toBeNull();
    expect(db.calls.insert).not.toHaveBeenCalled();
  });
});

describe('chatThreadService — migração do histórico legado', () => {
  beforeEach(() => {
    db.reset();
    db.setUser({ id: 'u-1' });
    localStorage.clear();
  });

  it('não reimporta quando a flag de migração já está marcada', async () => {
    localStorage.setItem(LEGACY_FLAG, '1');
    localStorage.setItem(
      'nexus:chat:v1:a-1',
      JSON.stringify([{ id: '1', role: 'user', content: 'oi', timestamp: 1 }]),
    );

    const imported = await migrateLegacyLocalHistory(['a-1']);

    expect(imported).toBe(0);
    expect(db.calls.insert).not.toHaveBeenCalled();
  });

  it('não reimporta em thread que já tem mensagens — protege contra duplicação multi-dispositivo', async () => {
    localStorage.setItem(
      'nexus:chat:v1:a-1',
      JSON.stringify([{ id: '1', role: 'user', content: 'oi', timestamp: 1 }]),
    );
    db.setTableResult('chat_threads', {
      data: {
        id: 't-1',
        agent_id: 'a-1',
        title: 'Nova conversa',
        last_message_at: '2026-01-01T00:00:00Z',
        message_count: 7, // já conversou em outro dispositivo
      },
      error: null,
    });

    const imported = await migrateLegacyLocalHistory(['a-1']);

    expect(imported).toBe(0);
    // A flag é marcada mesmo assim: a intenção é "não tentar de novo".
    expect(localStorage.getItem(LEGACY_FLAG)).toBe('1');
  });

  it('ignora payload corrompido no localStorage sem lançar', async () => {
    localStorage.setItem('nexus:chat:v1:a-1', '{ isto não é json válido');

    await expect(migrateLegacyLocalHistory(['a-1'])).resolves.toBe(0);
    expect(localStorage.getItem(LEGACY_FLAG)).toBe('1');
  });

  it('ignora entrada que não é um array, evitando iterar sobre objeto arbitrário', async () => {
    localStorage.setItem('nexus:chat:v1:a-1', JSON.stringify({ hack: true }));

    await expect(migrateLegacyLocalHistory(['a-1'])).resolves.toBe(0);
  });
});
