import { describe, it, expect } from 'vitest';
import { evaluateInstallImpact, type NamedSkillRef } from '@/lib/skills/installGuard';
import {
  buildInstallCapRecord,
  classifyInstallCap,
  projectDroppedNames,
  shouldAuditInstall,
  MAX_AUDITED_NAMES,
} from '@/lib/skills/installCapAudit';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

const refs = (n: number, prefix = 's'): NamedSkillRef[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix} ${i}` }));

const build = (instaladas: number, novas: number) => {
  const installed = refs(instaladas, 'inst');
  const selected = refs(novas, 'nova');
  const guard = evaluateInstallImpact({ installed, selected });
  return buildInstallCapRecord({
    agentId: 'agent-1',
    agentName: 'Agente Teste',
    installed,
    selected,
    guard,
    acknowledged: true,
  });
};

describe('installCapAudit — matriz combinatória', () => {
  it('mantém invariantes em ~1.000 combinações', () => {
    for (let instaladas = 0; instaladas <= 30; instaladas++) {
      for (let novas = 0; novas <= 30; novas++) {
        const r = build(instaladas, novas);
        expect(r.slotsBefore).toBe(instaladas);
        expect(r.slotsAfter).toBe(instaladas + novas);
        expect(r.cap).toBe(MAX_PROMPT_SKILLS);
        expect(r.totalDroppedAfter).toBe(Math.max(0, instaladas + novas - MAX_PROMPT_SKILLS));
        expect(r.droppedNames.length).toBeLessThanOrEqual(MAX_AUDITED_NAMES);
        expect(r.droppedNames.length + r.droppedNamesTruncated).toBe(r.totalDroppedAfter);
        expect(shouldAuditInstall(r)).toBe(r.totalDroppedAfter > 0);
      }
    }
  });
});

describe('classifyInstallCap', () => {
  it('dentro do teto quando há folga confortável', () => {
    expect(build(1, 1).severity).toBe('dentro_do_teto');
  });
  it('próximo do teto quando a folga é mínima', () => {
    expect(build(MAX_PROMPT_SKILLS - 2, 1).severity).toBe('proximo_do_teto');
  });
  it('estourou quando ocupa exatamente o teto', () => {
    expect(build(MAX_PROMPT_SKILLS - 1, 1).severity).toBe('estourou_o_teto');
  });
  it('estourou quando ultrapassa', () => {
    expect(build(MAX_PROMPT_SKILLS, 3).severity).toBe('estourou_o_teto');
  });
  it('deriva apenas da guarda', () => {
    const guard = evaluateInstallImpact({ installed: refs(40), selected: [] });
    expect(classifyInstallCap(guard)).toBe('estourou_o_teto');
  });
});

describe('projectDroppedNames', () => {
  it('descarta a cauda da ordem instaladas → selecionadas', () => {
    const installed = refs(MAX_PROMPT_SKILLS, 'inst');
    const selected = refs(2, 'nova');
    expect(projectDroppedNames(installed, selected)).toEqual(['nova 0', 'nova 1']);
  });
  it('ignora duplicatas por nome normalizado', () => {
    const installed = [{ id: 'a', name: 'Análise' }];
    const selected = [{ id: 'b', name: 'analise' }, { id: 'c', name: '' }];
    expect(projectDroppedNames(installed, selected)).toEqual([]);
  });
  it('lista vazia quando cabe tudo', () => {
    expect(projectDroppedNames(refs(3), refs(2, 'x'))).toEqual([]);
  });
  it('tolera entradas nulas', () => {
    expect(projectDroppedNames([], [])).toEqual([]);
  });
});

describe('buildInstallCapRecord — robustez', () => {
  it('nome ausente vira rótulo neutro', () => {
    const guard = evaluateInstallImpact({ installed: [], selected: refs(1) });
    const r = buildInstallCapRecord({ agentId: 'a', agentName: '  ', installed: [], selected: refs(1), guard });
    expect(r.agentName).toBe('sem nome');
    expect(r.acknowledged).toBe(false);
  });
  it('conta redundantes sem inflar slots', () => {
    const installed = [{ id: 'a', name: 'Copy' }];
    const selected = [{ id: 'b', name: 'copy' }, { id: 'c', name: 'Novo' }];
    const guard = evaluateInstallImpact({ installed, selected });
    const r = buildInstallCapRecord({ agentId: 'a', installed, selected, guard });
    expect(r.redundant).toBe(1);
    expect(r.effectiveAdds).toBe(1);
    expect(shouldAuditInstall(r)).toBe(false);
  });
  it('marca crossesCap apenas na primeira travessia', () => {
    expect(build(MAX_PROMPT_SKILLS - 1, 3).crossesCap).toBe(true);
    expect(build(MAX_PROMPT_SKILLS + 5, 3).crossesCap).toBe(false);
  });
  it('trunca a lista de nomes em lotes patológicos', () => {
    const r = build(MAX_PROMPT_SKILLS, 200);
    expect(r.droppedNames).toHaveLength(MAX_AUDITED_NAMES);
    expect(r.droppedNamesTruncated).toBe(200 - MAX_AUDITED_NAMES);
  });
});
