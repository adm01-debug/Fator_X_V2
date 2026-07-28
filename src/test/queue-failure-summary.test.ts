import { describe, expect, it } from 'vitest';

import type { QueueItemState, QueueSnapshot } from '@/lib/skills/llmClassificationQueue';
import {
  FAILURE_CATEGORY_ORDER,
  formatFailureSummary,
  summarizeQueueFailures,
  toFailureCategory,
  type FailureCategory,
} from '@/lib/skills/queueFailureSummary';

function item(
  id: string,
  status: QueueItemState<string>['status'],
  errorKind: string | null = null,
  lastError: string | null = null,
): QueueItemState<string> {
  return {
    id,
    status,
    attempts: 1,
    maxAttempts: 3,
    lastError,
    errorKind,
    result: null,
    nextRetryAt: null,
  };
}

function snap(items: QueueItemState<string>[]): QueueSnapshot<string> {
  return { items, done: items.length, total: items.length, running: false };
}

describe('toFailureCategory — normalização', () => {
  it('aceita todas as categorias conhecidas', () => {
    for (const c of FAILURE_CATEGORY_ORDER) {
      expect(toFailureCategory(c)).toBe(c);
    }
  });

  it('é insensível a caixa e espaços', () => {
    expect(toFailureCategory('  CREDITOS ')).toBe('creditos');
    expect(toFailureCategory('Taxa')).toBe('taxa');
  });

  it('kind desconhecido nunca vira categoria fantasma', () => {
    for (const lixo of [null, undefined, '', 'erro', 'boom', '  ', '402']) {
      expect(toFailureCategory(lixo)).toBe('desconhecido');
    }
  });
});

describe('summarizeQueueFailures — agrupamento', () => {
  it('snapshot vazio/nulo devolve resumo neutro sem retryPointless', () => {
    for (const entrada of [null, undefined, snap([])]) {
      const r = summarizeQueueFailures(entrada);
      expect(r.totalFailed).toBe(0);
      expect(r.buckets).toEqual([]);
      // Crítico: sem falhas, "retryPointless" TEM que ser falso, senão a UI
      // desabilitaria o botão num lote 100% bem-sucedido.
      expect(r.retryPointless).toBe(false);
    }
  });

  it('ignora itens concluídos e em andamento', () => {
    const r = summarizeQueueFailures(
      snap([
        item('a', 'concluido'),
        item('b', 'pendente'),
        item('c', 'executando'),
        item('d', 'aguardando_retry'),
      ]),
    );
    expect(r.totalFailed).toBe(0);
  });

  it('agrupa por categoria e soma bate com o total de falhas', () => {
    const r = summarizeQueueFailures(
      snap([
        item('a', 'falhou', 'creditos'),
        item('b', 'falhou', 'creditos'),
        item('c', 'falhou', 'taxa'),
        item('d', 'concluido'),
      ]),
    );
    expect(r.totalFailed).toBe(3);
    expect(r.buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(r.buckets.map((b) => b.category)).toEqual(['creditos', 'taxa']);
  });

  it('cancelado conta como não-feito, com categoria própria', () => {
    const r = summarizeQueueFailures(snap([item('a', 'cancelado'), item('b', 'falhou', 'rede')]));
    expect(r.totalFailed).toBe(2);
    expect(r.buckets.map((b) => b.category)).toEqual(['rede', 'cancelado']);
  });

  it('cancelado ignora errorKind residual de tentativa anterior', () => {
    // Um item pode ter falhado com 429 e depois ser cancelado; o estado final
    // manda, senão o curador vê "limite de taxa" onde ele mesmo abortou.
    const r = summarizeQueueFailures(snap([item('a', 'cancelado', 'taxa')]));
    expect(r.buckets[0].category).toBe('cancelado');
  });

  it('respeita a ordem de exibição, não a ordem de chegada', () => {
    const r = summarizeQueueFailures(
      snap([
        item('a', 'falhou', 'desconhecido'),
        item('b', 'falhou', 'taxa'),
        item('c', 'falhou', 'creditos'),
        item('d', 'falhou', 'permissao'),
      ]),
    );
    expect(r.buckets.map((b) => b.category)).toEqual([
      'creditos',
      'permissao',
      'taxa',
      'desconhecido',
    ]);
  });
});

describe('summarizeQueueFailures — decisão de retry', () => {
  it('lote 100% definitivo marca retryPointless e não oferece ids', () => {
    const r = summarizeQueueFailures(
      snap([
        item('a', 'falhou', 'creditos'),
        item('b', 'falhou', 'permissao'),
        item('c', 'falhou', 'invalido'),
      ]),
    );
    expect(r.retryPointless).toBe(true);
    expect(r.retryableSkillIds).toEqual([]);
  });

  it('uma única categoria transitória já libera o retry direcionado', () => {
    const r = summarizeQueueFailures(
      snap([item('a', 'falhou', 'creditos'), item('b', 'falhou', 'taxa')]),
    );
    expect(r.retryPointless).toBe(false);
    expect(r.retryableSkillIds).toEqual(['b']);
    // E o id definitivo NUNCA entra na lista de retry.
    expect(r.retryableSkillIds).not.toContain('a');
  });

  it('categorias definitivas nunca aparecem em retryableSkillIds', () => {
    const definitivas: FailureCategory[] = ['creditos', 'permissao', 'invalido'];
    for (const c of definitivas) {
      const r = summarizeQueueFailures(snap([item('x', 'falhou', c)]));
      expect(r.retryableSkillIds, c).toEqual([]);
      expect(r.buckets[0].retryUseful).toBe(false);
    }
  });

  it('id vazio é contado mas não vira alvo de retry', () => {
    const r = summarizeQueueFailures(snap([item('', 'falhou', 'rede'), item('ok', 'falhou', 'rede')]));
    expect(r.totalFailed).toBe(2);
    expect(r.buckets[0].count).toBe(2);
    // Retentar um id vazio reprocessaria o alvo errado.
    expect(r.retryableSkillIds).toEqual(['ok']);
  });

  it('todo bucket tem rótulo e dica não vazios', () => {
    for (const c of FAILURE_CATEGORY_ORDER) {
      const r = summarizeQueueFailures(snap([item('x', 'falhou', c)]));
      expect(r.buckets[0].label.length).toBeGreaterThan(0);
      expect(r.buckets[0].hint.length).toBeGreaterThan(0);
    }
  });

  it('guarda a primeira mensagem crua como amostra, sem sobrescrever', () => {
    const r = summarizeQueueFailures(
      snap([
        item('a', 'falhou', 'rede', 'primeira'),
        item('b', 'falhou', 'rede', 'segunda'),
      ]),
    );
    expect(r.buckets[0].sample).toBe('primeira');
  });

  it('amostra ausente permanece null em vez de string vazia', () => {
    const r = summarizeQueueFailures(snap([item('a', 'falhou', 'rede', '')]));
    expect(r.buckets[0].sample).toBeNull();
  });
});

describe('formatFailureSummary', () => {
  it('lote sem falhas produz string vazia', () => {
    expect(formatFailureSummary(summarizeQueueFailures(snap([item('a', 'concluido')])))).toBe('');
  });

  it('concatena categorias na ordem de severidade', () => {
    const texto = formatFailureSummary(
      summarizeQueueFailures(
        snap([
          item('a', 'falhou', 'taxa'),
          item('b', 'falhou', 'creditos'),
          item('c', 'falhou', 'creditos'),
        ]),
      ),
    );
    expect(texto).toBe('2 créditos de ia esgotados · 1 limite de taxa');
  });
});
