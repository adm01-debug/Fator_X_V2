/**
 * forum: leitura pública pelas views com máscara de PII.
 *
 * `listThreads`, `getThread` e `listPosts` liam as tabelas cruas com
 * `select('*')` numa página pública — o `author_name` podia conter e-mail e
 * as views `forum_threads_safe`/`forum_posts_safe` (que trocam por 'Membro')
 * existiam sem uso. Este teste trava a fronteira: a leitura tem que sair das
 * views, e a escrita continua nas tabelas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSharedSupabaseMock } from './utils/supabaseMock';

vi.mock('@/integrations/supabase/client', async () => {
  const m = await import('./utils/supabaseMock');
  return { supabase: m.getSharedSupabaseMock('forum-safe').client };
});

import { getThread, listPosts, listThreads } from '@/services/knowledgeManagementService';

const db = getSharedSupabaseMock('forum-safe');

beforeEach(() => {
  db.reset();
});

describe('knowledgeManagementService — fórum público pelas views seguras', () => {
  it('listThreads lê a view mascarada e filtra pelo help center', async () => {
    db.setTableResult('forum_threads_safe', {
      data: [{ id: 't1', help_center_id: 'hc1', author_name: 'Membro', title: 'Oi', body: 'x' }],
      error: null,
    });

    const threads = await listThreads('hc1');

    expect(db.calls.from).toHaveBeenCalledWith('forum_threads_safe');
    expect(db.calls.from).not.toHaveBeenCalledWith('forum_threads');
    expect(db.calls.eq).toHaveBeenCalledWith('help_center_id', 'hc1');
    expect(threads).toHaveLength(1);
    expect(threads[0].author_name).toBe('Membro');
  });

  it('listPosts lê a view mascarada de posts', async () => {
    db.setTableResult('forum_posts_safe', { data: [{ id: 'p1', thread_id: 't1' }], error: null });

    const posts = await listPosts('t1');

    expect(db.calls.from).toHaveBeenCalledWith('forum_posts_safe');
    expect(db.calls.from).not.toHaveBeenCalledWith('forum_posts');
    expect(db.calls.eq).toHaveBeenCalledWith('thread_id', 't1');
    expect(posts).toHaveLength(1);
  });

  it('getThread lê a view e incrementa view_count na tabela base', async () => {
    db.setTableResult('forum_threads_safe', {
      data: { id: 't1', view_count: 4, author_name: 'Membro' },
      error: null,
    });

    const thread = await getThread('t1');

    expect(db.calls.from).toHaveBeenCalledWith('forum_threads_safe');
    expect(db.calls.from).toHaveBeenCalledWith('forum_threads');
    expect(db.calls.update).toHaveBeenCalledWith({ view_count: 5 });
    expect(thread?.view_count).toBe(4);
  });

  it('devolve lista vazia (e não explode) quando a view não retorna linhas', async () => {
    db.setTableResult('forum_threads_safe', { data: null, error: null });

    await expect(listThreads('hc1')).resolves.toEqual([]);
  });
});
