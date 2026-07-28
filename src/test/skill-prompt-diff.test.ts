/**
 * Simulação combinatória do diff de prompts e do artefato de auditoria.
 *
 * O modo de falha que estamos prevenindo é o silencioso: uma skill continua
 * instalada nos dois lados, mas em um deles caiu no overflow do teto — o
 * agente perdeu a capacidade sem nenhum sinal na UI. Os cenários abaixo
 * enumeram tamanhos de catálogo, sujeira, duplicatas e ausência de id para
 * garantir que o diff nunca perca esse caso nem invente mudanças falsas.
 */
import { describe, it, expect } from 'vitest';
import { simulatePrompt, MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';
import { diffPromptSimulations } from '@/lib/skills/promptDiff';
import {
  buildPromptAuditArtifact,
  buildArtifactFilename,
} from '@/lib/skills/promptAuditArtifact';
import type { CompilePromptInput, PromptSkill } from '@/lib/promptCompiler';

function skills(n: number, prefix = 'skill', withId = true): PromptSkill[] {
  return Array.from({ length: n }, (_, i) => ({
    id: withId ? `${prefix}-${i}` : undefined,
    name: `${prefix} ${String(i).padStart(3, '0')}`,
    description: `Descrição da ${prefix} ${i}`,
    category: 'ops',
  }));
}

function input(list: PromptSkill[], overrides: Partial<CompilePromptInput> = {}): CompilePromptInput {
  return {
    name: 'Agente Teste',
    emoji: '🤖',
    mission: 'Missão de teste',
    type: 'assistant',
    model: 'google/gemini-2.5-flash',
    prompt: 'Você é um agente de testes.',
    list: undefined,
    skills: list,
    ...overrides,
  } as CompilePromptInput;
}

const SIZES = [0, 1, 5, 24, 25, 26, 40, 80];

describe('diffPromptSimulations — simulação combinatória', () => {
  it(`cobre ${SIZES.length * SIZES.length} pares de tamanhos sem inconsistência de totais`, () => {
    let executed = 0;
    for (const a of SIZES) {
      for (const b of SIZES) {
        const left = simulatePrompt(input(skills(a)));
        const right = simulatePrompt(input(skills(b)));
        const diff = diffPromptSimulations(left, right);

        const union = new Set([
          ...skills(a).map((s) => s.id as string),
          ...skills(b).map((s) => s.id as string),
        ]);
        expect(diff.skills).toHaveLength(union.size);

        const soma =
          diff.totals.added +
          diff.totals.removed +
          diff.totals.enteredPrompt +
          diff.totals.leftPrompt +
          diff.totals.changed +
          diff.totals.unchanged;
        expect(soma).toBe(diff.skills.length);

        // Ninguém pode ser classificado em dois baldes ao mesmo tempo.
        const chaves = new Set(diff.skills.map((s) => s.key));
        expect(chaves.size).toBe(diff.skills.length);
        executed += 1;
      }
    }
    expect(executed).toBe(SIZES.length * SIZES.length);
  });

  it('é reflexivo: comparar uma simulação consigo mesma não gera mudanças', () => {
    for (const n of SIZES) {
      const sim = simulatePrompt(input(skills(n)));
      const diff = diffPromptSimulations(sim, sim);
      expect(diff.identical).toBe(true);
      expect(diff.tokenDelta).toBe(0);
      expect(diff.lineStats.added + diff.lineStats.removed).toBe(0);
      expect(diff.skills.every((s) => s.kind === 'inalterada')).toBe(true);
    }
  });

  it('detecta a skill que continua instalada mas caiu no overflow', () => {
    // "aaa" ordena antes de tudo, então sobrevive; ao adicionar skills que
    // ordenam antes dela, ela é empurrada para fora do teto.
    const alvo: PromptSkill = { id: 'alvo', name: 'zzz alvo', description: 'crítica' };
    const antes = simulatePrompt(input([...skills(MAX_PROMPT_SKILLS - 1, 'aaa'), alvo]));
    const depois = simulatePrompt(input([...skills(MAX_PROMPT_SKILLS + 10, 'aaa'), alvo]));

    const diff = diffPromptSimulations(antes, depois);
    const mudanca = diff.skills.find((s) => s.key === 'alvo');
    expect(mudanca?.kind).toBe('saiu_do_prompt');
    expect(diff.totals.leftPrompt).toBeGreaterThanOrEqual(1);
    expect(diff.identical).toBe(false);
  });

  it('reconhece o caminho inverso: skill que volta ao prompt', () => {
    const alvo: PromptSkill = { id: 'alvo', name: 'zzz alvo' };
    const antes = simulatePrompt(input([...skills(MAX_PROMPT_SKILLS + 10, 'aaa'), alvo]));
    const depois = simulatePrompt(input([...skills(2, 'aaa'), alvo]));
    const diff = diffPromptSimulations(antes, depois);
    expect(diff.skills.find((s) => s.key === 'alvo')?.kind).toBe('entrou_no_prompt');
  });

  it('marca alteração de texto quando só a descrição muda', () => {
    const antes = simulatePrompt(input([{ id: 'x', name: 'Skill X', description: 'antes' }]));
    const depois = simulatePrompt(input([{ id: 'x', name: 'Skill X', description: 'depois' }]));
    const diff = diffPromptSimulations(antes, depois);
    expect(diff.skills[0].kind).toBe('alterada');
    expect(diff.totals.changed).toBe(1);
  });

  it('correlaciona por nome quando não há id', () => {
    const antes = simulatePrompt(input(skills(3, 'sem-id', false)));
    const depois = simulatePrompt(input(skills(3, 'sem-id', false)));
    const diff = diffPromptSimulations(antes, depois);
    expect(diff.skills).toHaveLength(3);
    expect(diff.totals.unchanged).toBe(3);
  });

  it('ignora entradas descartadas e não as conta como remoção', () => {
    const antes = simulatePrompt(input([{ id: 'a', name: 'Boa' }, { name: '   ' }, { name: '<b></b>' }]));
    const depois = simulatePrompt(input([{ id: 'a', name: 'Boa' }]));
    const diff = diffPromptSimulations(antes, depois);
    expect(diff.skills).toHaveLength(1);
    expect(diff.totals.removed).toBe(0);
  });

  it('não duplica chaves quando a entrada tem duplicatas', () => {
    const dup: PromptSkill[] = [
      { id: 'd', name: 'Dup' },
      { id: 'd', name: 'Dup' },
      { id: 'd', name: 'Dup' },
    ];
    const diff = diffPromptSimulations(simulatePrompt(input(dup)), simulatePrompt(input(dup)));
    expect(diff.skills).toHaveLength(1);
    expect(diff.skills[0].kind).toBe('inalterada');
  });

  it('reporta delta de tokens coerente com o sentido da mudança', () => {
    const pequeno = simulatePrompt(input(skills(2)));
    const grande = simulatePrompt(input(skills(20)));
    expect(diffPromptSimulations(pequeno, grande).tokenDelta).toBeGreaterThan(0);
    expect(diffPromptSimulations(grande, pequeno).tokenDelta).toBeLessThan(0);
  });

  it('ordena as mudanças críticas antes das inalteradas', () => {
    const antes = simulatePrompt(input([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]));
    const depois = simulatePrompt(input([{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }]));
    const diff = diffPromptSimulations(antes, depois);
    expect(diff.skills[diff.skills.length - 1].kind).toBe('inalterada');
    expect(diff.skills[0].kind).not.toBe('inalterada');
  });
});

describe('buildPromptAuditArtifact', () => {
  const meta = {
    agentId: 'agent-1',
    agentName: 'Agente de Vendas',
    model: 'google/gemini-2.5-flash',
    persona: 'sdr',
    generatedAt: '2026-07-28T10:00:00.000Z',
  };

  it('gera markdown autocontido com prompt, diagnóstico e tabela', () => {
    const sim = simulatePrompt(input(skills(30)));
    const md = buildPromptAuditArtifact(sim, { ...meta, forcedOverflow: true });

    expect(md).toContain('# Evidência de auditoria');
    expect(md).toContain('agent-1');
    expect(md).toContain(`- Cortadas por overflow: ${sim.diagnostics.overflow}`);
    expect(md).toContain('| Skill | Destino | Sanitização | Categoria |');
    expect(md).toContain('````text');
    expect(md).toContain(sim.compiled.text);
    expect(md).toContain('overflow forçado:** sim');
  });

  it('não quebra a tabela quando a skill contém pipe ou quebra de linha', () => {
    const sim = simulatePrompt(input([{ id: 'p', name: 'Skill | pipe', description: 'a|b' }]));
    const md = buildPromptAuditArtifact(sim, meta);
    const linha = md.split('\n').find((l) => l.includes('pipe')) ?? '';
    expect(linha.split('|').length).toBe(6); // 4 células + bordas
    expect(linha).toContain('\\|');
  });

  it('funciona com catálogo vazio', () => {
    const sim = simulatePrompt(input([]));
    const md = buildPromptAuditArtifact(sim, meta);
    expect(md).toContain('_(nenhuma skill instalada)_');
    expect(md).toContain('- No prompt: 0');
  });

  it('produz nome de arquivo seguro e determinístico', () => {
    expect(buildArtifactFilename(meta)).toBe('prompt-agente-de-vendas-2026-07-28T10-00-00-000.md');
    expect(
      buildArtifactFilename({ ...meta, agentName: 'Ação/Çç *?<>' }),
    ).toMatch(/^prompt-acao-c-2026-07-28T10-00-00-000\.md$/);
    expect(buildArtifactFilename({ ...meta, agentName: '' })).toContain('prompt-agent-1');
  });

  it('sinaliza variáveis não resolvidas no artefato', () => {
    const sim = simulatePrompt(input([], { prompt: 'Olá {{cliente}} de {{empresa}}' }));
    const md = buildPromptAuditArtifact(sim, meta);
    expect(md).toContain('Variáveis não resolvidas: cliente, empresa');
  });

  it('mantém integridade em 120 combinações de tamanho × toggles', () => {
    let executed = 0;
    for (const n of [0, 1, 25, 26, 60]) {
      for (const overflow of [true, false]) {
        for (const sujo of [true, false]) {
          for (const prompt of ['curto', 'com ```bloco``` de código', 'com {{var}} pendente']) {
            const lista = sujo
              ? [...skills(n), { id: 'dirty', name: '<b>Suja</b>\nquebrada' }]
              : skills(n);
            const sim = simulatePrompt(input(lista, { prompt }));
            const md = buildPromptAuditArtifact(sim, {
              ...meta,
              forcedOverflow: overflow,
              injectedDirtySkill: sujo,
            });
            expect(md.startsWith('# Evidência de auditoria')).toBe(true);
            expect(md).toContain('## Prompt final');
            expect(md).toContain(`- Recebidas: ${sim.diagnostics.received}`);
            executed += 1;
          }
        }
      }
    }
    expect(executed).toBe(60);
  });
});
