/**
 * Simulação exaustiva do detector de estouro do teto de skills.
 *
 * Cobre centenas de cenários combinatórios: toda contagem de 0 a 120, entradas
 * degeneradas (negativas, NaN, fracionárias), ordenação estável e projeção de
 * impacto de instalação em lote.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyAgentLoad,
  summarizeOverflowFleet,
  projectInstallImpact,
  NEAR_CAP_MARGIN,
  type AgentSkillLoad,
} from '@/lib/skills/promptOverflowAlert';
import { MAX_PROMPT_SKILLS } from '@/lib/skills/promptSimulation';

const load = (installed: number, i = 0): AgentSkillLoad => ({
  agentId: `a-${i}`,
  agentName: `Agente ${String(i).padStart(3, '0')}`,
  installed,
});

describe('classifyAgentLoad — varredura de 0 a 120', () => {
  it('mantém invariantes em toda a faixa', () => {
    for (let n = 0; n <= 120; n += 1) {
      const a = classifyAgentLoad(load(n));
      expect(a.dropped).toBe(Math.max(0, n - MAX_PROMPT_SKILLS));
      expect(a.headroom).toBe(Math.max(0, MAX_PROMPT_SKILLS - n));
      // Nunca há descarte e folga ao mesmo tempo.
      expect(a.dropped === 0 || a.headroom === 0).toBe(true);
      expect(a.utilization).toBe(Math.round((n / MAX_PROMPT_SKILLS) * 100));
      if (n > MAX_PROMPT_SKILLS) expect(a.severity).toBe('critico');
      else if (n >= MAX_PROMPT_SKILLS - NEAR_CAP_MARGIN) expect(a.severity).toBe('atencao');
      else expect(a.severity).toBe('ok');
    }
  });

  it('não trata o teto exato como crítico', () => {
    const a = classifyAgentLoad(load(MAX_PROMPT_SKILLS));
    expect(a.severity).toBe('atencao');
    expect(a.dropped).toBe(0);
    expect(a.utilization).toBe(100);
  });

  it('neutraliza entradas degeneradas', () => {
    for (const bad of [-1, -999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const a = classifyAgentLoad(load(bad));
      expect(a.installed).toBe(0);
      expect(a.severity).toBe('ok');
      expect(a.dropped).toBe(0);
    }
    expect(classifyAgentLoad(load(26.9)).installed).toBe(26);
  });
});

describe('summarizeOverflowFleet', () => {
  it('é vazio-seguro', () => {
    const s = summarizeOverflowFleet([]);
    expect(s).toMatchObject({
      totalAgents: 0,
      critical: 0,
      totalDropped: 0,
      averageUtilization: 0,
    });
  });

  it('mantém a soma das categorias igual ao total em 200 frotas aleatórias', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let f = 0; f < 200; f += 1) {
      const tamanho = Math.floor(rand() * 30);
      const frota = Array.from({ length: tamanho }, (_, i) => load(Math.floor(rand() * 60), i));
      const s = summarizeOverflowFleet(frota);
      expect(s.critical + s.warning + s.healthy).toBe(s.totalAgents);
      expect(s.totalAgents).toBe(tamanho);
      expect(s.totalDropped).toBe(s.alerts.reduce((acc, a) => acc + a.dropped, 0));
      // Ordenação: severidade não pode piorar ao longo da lista.
      const rank = { critico: 0, atencao: 1, ok: 2 } as const;
      for (let i = 1; i < s.alerts.length; i += 1) {
        expect(rank[s.alerts[i - 1].severity]).toBeLessThanOrEqual(rank[s.alerts[i].severity]);
      }
    }
  });

  it('ordena o pior descarte primeiro e desempata por nome', () => {
    const s = summarizeOverflowFleet([
      { agentId: '1', agentName: 'Zeta', installed: 30 },
      { agentId: '2', agentName: 'Alfa', installed: 30 },
      { agentId: '3', agentName: 'Beta', installed: 90 },
      { agentId: '4', agentName: 'Gama', installed: 2 },
    ]);
    expect(s.alerts.map((a) => a.agentName)).toEqual(['Beta', 'Alfa', 'Zeta', 'Gama']);
    expect(s.critical).toBe(3);
    expect(s.healthy).toBe(1);
  });

  it('é determinístico sob reordenação da entrada', () => {
    const base = Array.from({ length: 12 }, (_, i) => load((i * 7) % 45, i));
    const a = summarizeOverflowFleet(base);
    const b = summarizeOverflowFleet([...base].reverse());
    expect(a.alerts.map((x) => x.agentId)).toEqual(b.alerts.map((x) => x.agentId));
  });
});

describe('projectInstallImpact', () => {
  it('varre 0..40 atuais × 0..20 adicionais sem inconsistência', () => {
    for (let atual = 0; atual <= 40; atual += 1) {
      for (let extra = 0; extra <= 20; extra += 1) {
        const p = projectInstallImpact(atual, extra);
        expect(p.resultingInstalled).toBe(atual + extra);
        expect(p.willDrop).toBeGreaterThanOrEqual(0);
        expect(p.willDrop).toBeLessThanOrEqual(extra);
        const jaEstourado = atual > MAX_PROMPT_SKILLS;
        if (jaEstourado) expect(p.crossesCap).toBe(false);
        if (p.crossesCap) expect(p.willDrop).toBeGreaterThan(0);
      }
    }
  });

  it('marca a travessia exata do teto', () => {
    const p = projectInstallImpact(MAX_PROMPT_SKILLS, 1);
    expect(p.crossesCap).toBe(true);
    expect(p.willDrop).toBe(1);
    expect(projectInstallImpact(MAX_PROMPT_SKILLS - 1, 1).crossesCap).toBe(false);
  });

  it('quando já estourado, todo adicional é 100% descartado', () => {
    const p = projectInstallImpact(40, 5);
    expect(p.willDrop).toBe(5);
    expect(p.crossesCap).toBe(false);
  });
});
