/**
 * Evidência de auditoria do prompt compilado.
 *
 * Foco em invariantes que quebrariam a utilidade forense do registro:
 * checksum estável e sensível, ausência do prompt na trilha, contabilidade
 * batendo com o diagnóstico e limite de nomes em overflow.
 */
import { describe, it, expect } from 'vitest';
import {
  artifactChecksum,
  buildPromptAuditArtifact,
  buildPromptEvidenceRecord,
  type PromptArtifactMeta,
} from '@/lib/skills/promptAuditArtifact';
import { simulatePrompt, MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';
import type { PromptSkill } from '@/lib/promptCompiler';

const META: PromptArtifactMeta = {
  agentId: 'agent-1',
  agentName: 'Nexus QA',
  model: 'google/gemini-2.5-flash',
  persona: 'analista',
  generatedAt: '2026-07-28T12:00:00.000Z',
};

function skills(n: number, prefix = 'Skill'): PromptSkill[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s-${prefix}-${i}`,
    name: `${prefix} ${String(i + 1).padStart(3, '0')}`,
    description: 'descrição',
    category: 'geral',
  }));
}

function simulate(list: PromptSkill[]) {
  return simulatePrompt({
    name: 'Nexus QA',
    emoji: '🤖',
    mission: 'auditar',
    type: 'analista',
    model: META.model,
    prompt: 'Você é um auditor. {{missao}}',
    skills: list,
  });
}

function record(list: PromptSkill[], meta: PromptArtifactMeta = META) {
  const result = simulate(list);
  const artifact = buildPromptAuditArtifact(result, meta);
  return { result, artifact, evidence: buildPromptEvidenceRecord(result, meta, artifact) };
}

describe('artifactChecksum', () => {
  it('é determinístico e cabe em 8 hex', () => {
    for (const s of ['', 'a', 'prompt longo '.repeat(500), '🤖 unicode ç']) {
      const h = artifactChecksum(s);
      expect(h).toMatch(/^[0-9a-f]{8}$/);
      expect(artifactChecksum(s)).toBe(h);
    }
  });

  it('muda com alteração de um único caractere', () => {
    const base = 'conteudo do artefato';
    const colisoes = new Set<string>();
    for (let i = 0; i < base.length; i += 1) {
      const mutado = base.slice(0, i) + 'X' + base.slice(i + 1);
      colisoes.add(artifactChecksum(mutado));
      expect(artifactChecksum(mutado)).not.toBe(artifactChecksum(base));
    }
    // Sem colisões entre as mutações de 1 caractere.
    expect(colisoes.size).toBe(base.length);
  });

  it('não colide em 2.000 artefatos sintéticos distintos', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 2000; i += 1) vistos.add(artifactChecksum(`artefato-${i}-${i * 7919}`));
    expect(vistos.size).toBeGreaterThan(1995); // FNV-32 admite colisão rara
  });
});

describe('buildPromptEvidenceRecord', () => {
  it('casa checksum e tamanho com o artefato entregue', () => {
    const { artifact, evidence } = record(skills(3));
    expect(evidence.checksum).toBe(artifactChecksum(artifact));
    expect(evidence.artifactChars).toBe(artifact.length);
  });

  it('espelha o diagnóstico da simulação em qualquer tamanho de catálogo', () => {
    for (let n = 0; n <= 40; n += 1) {
      const { result, evidence } = record(skills(n));
      const d = result.diagnostics;
      expect(evidence.skillsReceived).toBe(d.received);
      expect(evidence.skillsInjected).toBe(d.injected);
      expect(evidence.skillsOverflow).toBe(d.overflow);
      expect(evidence.skillsDuplicates).toBe(d.duplicates);
      expect(evidence.skillsDiscarded).toBe(d.discarded);
      expect(evidence.skillsInjected).toBeLessThanOrEqual(MAX_PROMPT_SKILLS);
    }
  });

  it('lista as skills cortadas, truncando em 25 nomes', () => {
    const { evidence } = record(skills(80));
    expect(evidence.skillsOverflow).toBe(80 - MAX_PROMPT_SKILLS);
    expect(evidence.overflowedSkills.length).toBeLessThanOrEqual(25);
    expect(evidence.overflowedSkills.every((n) => n.trim() !== '')).toBe(true);
  });

  it('não vaza o prompt final dentro do registro', () => {
    const { result, evidence } = record(skills(2));
    const serializado = JSON.stringify(evidence);
    expect(serializado).not.toContain(result.compiled.text);
    expect(serializado).not.toContain('Você é um auditor');
  });

  it('preserva os toggles de estresse e a data injetada', () => {
    const meta = { ...META, forcedOverflow: true, injectedDirtySkill: true };
    const { evidence } = record(skills(30), meta);
    expect(evidence.forcedOverflow).toBe(true);
    expect(evidence.injectedDirtySkill).toBe(true);
    expect(evidence.generatedAt).toBe(META.generatedAt);
    expect(evidence.filename).toContain('prompt-nexus-qa-');
  });

  it('contabiliza sanitização e duplicatas sem inflar o total', () => {
    const sujas: PromptSkill[] = [
      { id: 'd1', name: '<b>HTML</b>\nquebra', description: 'x', category: 'demo' },
      { id: 'd2', name: 'Repetida', description: 'x', category: 'demo' },
      { id: 'd3', name: 'Repetida', description: 'x', category: 'demo' },
      { id: 'd4', name: '   ', description: 'x', category: 'demo' },
    ];
    const { evidence } = record(sujas);
    expect(evidence.skillsReceived).toBe(4);
    expect(
      evidence.skillsInjected + evidence.skillsOverflow + evidence.skillsDuplicates + evidence.skillsDiscarded,
    ).toBe(evidence.skillsReceived);
    expect(evidence.skillsSanitized).toBeGreaterThan(0);
  });

  it('sinaliza variáveis não resolvidas', () => {
    const { result, evidence } = record(skills(1));
    expect(evidence.unresolvedVariables).toBe(result.compiled.unresolvedVariables.length);
  });
});
