/**
 * Tier de plataforma do classificador de departamentos.
 *
 * Contexto: o filtro IDF (`PLATFORM_STOPWORDS`) remove o jargão de plataforma
 * ("agent", "skill", "llm", "mcp") antes da pontuação, porque ele aparece em
 * quase toda skill e sequestrava domínios legítimos. O efeito colateral é que
 * skills que SÓ falam desse jargão — ferramental de agentes puro — ficavam com
 * score zero e permaneciam órfãs para sempre.
 *
 * O tier `platform` fecha esse buraco: a mesma densidade de jargão que é ruído
 * para discriminar domínio vira evidência positiva de que o artefato é tooling
 * (portanto TI). A invariante crítica, travada abaixo, é que esse tier NUNCA
 * sobrescreve um veredito de domínio ou de agregador.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyDepartment,
  LOW_CONFIDENCE_THRESHOLD,
  MIN_PLATFORM_DENSITY,
  PLATFORM_TIER_CONFIDENCE,
  PLATFORM_TIER_DEPARTMENT,
  PLATFORM_STOPWORDS,
} from '@/services/skillDepartmentClassifier';

describe('tier de plataforma', () => {
  it('resolve tooling de agentes sem sinal de domínio como TI marcado para revisão', () => {
    const r = classifyDepartment({
      name: 'gstack',
      description: 'Router for the gstack skill suite.',
    });
    expect(r.department).toBe(PLATFORM_TIER_DEPARTMENT);
    expect(r.tier).toBe('platform');
    expect(r.confidence).toBe(PLATFORM_TIER_CONFIDENCE);
    expect(r.needsReview).toBe(true);
    // Veredito determinístico: não desperdiça chamada de LLM.
    expect(r.needsLlmFallback).toBe(false);
  });

  it('não sobrescreve um veredito de domínio com confiança alta', () => {
    const r = classifyDepartment({
      name: 'Agente de conciliação bancária',
      description:
        'Skill de agente que concilia extratos, notas fiscais e contas a pagar do financeiro.',
      tags: ['financeiro', 'conciliacao', 'contabil'],
    });
    expect(r.tier).toBe('domain');
    expect(r.department).toBe('financeiro');
    expect(r.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
  });

  it('não sobrescreve o balde transversal (agregadores)', () => {
    const r = classifyDepartment({
      name: 'awesome agent skills',
      description:
        'A curated awesome list collection of resources, links and repositories for llm agents.',
      tags: ['awesome', 'list', 'curated', 'resources', 'collection'],
    });
    expect(r.tier).toBe('transversal');
    expect(r.department).toBe('transversal');
  });

  it('mantém órfã a skill sem domínio E sem jargão de plataforma', () => {
    const r = classifyDepartment({
      name: 'zzz qqq',
      description: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed.',
    });
    expect(r.department).toBeNull();
    expect(r.tier).toBe('none');
    expect(r.platformDensity).toBeLessThan(MIN_PLATFORM_DENSITY);
  });

  it('platformDensity é a fração de stopwords sobre o texto bruto (nome+desc+tags)', () => {
    const r = classifyDepartment({
      name: 'agent skill llm',
      description: '',
      tags: [],
    });
    // Todos os três tokens são vocabulário de plataforma.
    expect(r.platformDensity).toBe(1);
  });

  it('varre o espaço de densidade: o tier só dispara acima do limiar', () => {
    const ruido = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta', 'eta', 'teta',
      'iota', 'kapa', 'lambda', 'mi', 'ni', 'csi', 'omicron', 'pi', 'ro', 'sigma',
      'tau', 'ipsilon', 'fi', 'qui', 'psi', 'omega'];
    for (let plataforma = 0; plataforma <= 6; plataforma += 1) {
      const tokensPlataforma = Array.from(PLATFORM_STOPWORDS).slice(0, plataforma);
      const texto = [...tokensPlataforma, ...ruido].join(' ');
      const r = classifyDepartment({ name: 'x', description: texto });
      const densidadeEsperada = r.platformDensity;
      if (densidadeEsperada >= MIN_PLATFORM_DENSITY) {
        expect(r.tier).toBe('platform');
      } else {
        expect(r.tier).not.toBe('platform');
      }
    }
  });

  it('invariante de monotonicidade: nenhum tier de plataforma nasce com confiança alta', () => {
    const amostras = [
      'openagentskill npm for ai agent skills',
      'fastmcp build mcp servers',
      'cc switch desktop assistant for claude code',
      'agency agents complete ai agency',
      'vibe coding prompt template workflow',
    ];
    for (const desc of amostras) {
      const r = classifyDepartment({ name: desc.split(' ')[0], description: desc });
      if (r.tier === 'platform') {
        expect(r.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
        expect(r.needsReview).toBe(true);
      }
    }
  });
});
