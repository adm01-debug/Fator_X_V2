/**
 * Guard arquitetural do dual-client.
 *
 * Contexto (por que este arquivo existe):
 * O projeto tem DOIS bancos. O client local (`@/integrations/supabase/client`)
 * é o de autenticação; `supabaseExternal` é onde mora a maior parte dos dados
 * de aplicação. O helper `fromTable()` existe apenas para RELAXAR A TIPAGEM
 * gerada — nunca para escolher banco.
 *
 * O bug que este guard trava: `fromTable` estava ancorado no client LOCAL.
 * Como ele é usado em ~130 pontos cobrindo 51 tabelas, e 24 dessas tabelas
 * NÃO EXISTEM no banco local, todo esse caminho resolvia para um banco onde a
 * tabela não existe — falhando com "tabela não encontrada" em vez de um erro
 * de negócio legível. Entre as afetadas: `credential_vault`, `notifications`,
 * `queue_items`, `execution_history`, `cron_schedules`, `dead_letter_queue`.
 *
 * A regressão é barata de reintroduzir (uma linha em supabaseExtended.ts) e
 * cara de detectar, porque o sintoma aparece longe da causa. Daí o guard ser
 * estático: falha no CI, não em produção.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCAL_SENTINEL = { __client: 'local' } as const;
const EXTERNAL_SENTINEL = { __client: 'external' } as const;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { ...LOCAL_SENTINEL, from: () => LOCAL_SENTINEL, rpc: () => LOCAL_SENTINEL },
}));

vi.mock('@/integrations/supabase/externalClient', () => ({
  supabaseExternal: {
    ...EXTERNAL_SENTINEL,
    from: (table: string) => ({ ...EXTERNAL_SENTINEL, table }),
    rpc: (fn: string, params?: unknown) => ({ ...EXTERNAL_SENTINEL, fn, params }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('arquitetura dual-client', () => {
  it('fromTable() resolve para o banco EXTERNO, não para o de auth', async () => {
    const { fromTable } = await import('@/lib/supabaseExtended');
    // Amostra deliberada: tabelas que comprovadamente NÃO existem no banco
    // local. Se o helper regredir para o client local, elas voltam a apontar
    // para um banco sem essas tabelas.
    for (const table of ['credential_vault', 'notifications', 'queue_items', 'execution_history']) {
      expect(fromTable(table)).toMatchObject({ __client: 'external', table });
    }
  });

  it('rpcCall() resolve para o banco EXTERNO', async () => {
    const { rpcCall } = await import('@/lib/supabaseExtended');
    await expect(rpcCall('purchase_skill', { id: 1 })).resolves.toMatchObject({
      __client: 'external',
      fn: 'purchase_skill',
    });
  });

  it('isUserLockedOut permanece no client LOCAL (é auth, não dado)', async () => {
    // A fronteira corta nos dois sentidos: mover auth para o banco externo
    // seria tão errado quanto o bug original.
    const src = readFileSync(resolve(__dirname, '../lib/supabaseExtended.ts'), 'utf-8');
    const fn = src.slice(src.indexOf('export const isUserLockedOut'));
    expect(fn).toContain('supabase.rpc(');
    expect(fn).not.toContain('looseClient.rpc(');
  });

  it('só existe uma implementação de syncExternalAuth', () => {
    // Já houve uma duplicata morta em supabaseExtended.ts que apenas escrevia
    // no localStorage e não sincronizava sessão alguma. Importá-la por engano
    // deixaria o client externo sem JWT e todo o RLS negaria acesso — um modo
    // de falha que se parece com "banco vazio", não com "não autenticado".
    const extended = readFileSync(resolve(__dirname, '../lib/supabaseExtended.ts'), 'utf-8');
    expect(extended).not.toContain('syncExternalAuth');

    const client = readFileSync(
      resolve(__dirname, '../integrations/supabase/externalClient.ts'),
      'utf-8',
    );
    expect(client).toContain('export async function syncExternalAuth');
  });
});
