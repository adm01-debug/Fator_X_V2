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
  PLATFORM_TIER_MAX_CONFIDENCE,
  LOW_CONFIDENCE_THRESHOLD,
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

/**
 * Confiança graduada — a evidência que sustenta o veredito precisa aparecer no
 * número. Enquanto todo item do tier valia 0.15 fixo, `gstack` (uma linha, zero
 * tópicos) e `fastmcp` (MCP, Python, servidores, clientes, nove tópicos)
 * empatavam na fila de revisão, e um curador que abre dez casos óbvios seguidos
 * para de abrir o décimo primeiro — que era o ambíguo de verdade.
 */
describe('confiança graduada do tier de plataforma', () => {
  const fraco = { name: 'gstack', description: 'Router for the gstack skill suite.' };
  const forte = {
    name: 'fastmcp',
    description: 'The fast, Pythonic way to build MCP servers and clients.',
    tags: ['agents', 'llms', 'mcp', 'mcp-clients', 'mcp-tools', 'model-context-protocol'],
  };

  it('evidência corroborada em dois campos supera o limiar e sai da fila', () => {
    const r = classifyDepartment(forte);
    expect(r.tier).toBe('platform');
    expect(r.platformEvidence.fieldsWithSignal).toBe(2);
    expect(r.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    expect(r.needsReview).toBe(false);
  });

  it('evidência de campo único fica abaixo do limiar por teto explícito', () => {
    const soTags = classifyDepartment({
      name: 'zzz',
      tags: ['agent', 'skill', 'llm', 'prompt', 'mcp', 'claude', 'codex', 'cursor'],
    });
    expect(soTags.platformEvidence.fieldsWithSignal).toBe(1);
    expect(soTags.confidence).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
    expect(soTags.needsReview).toBe(true);
  });

  it('o caso fraco permanece exatamente no piso', () => {
    const r = classifyDepartment(fraco);
    expect(r.platformEvidence).toEqual({ distinctTerms: 1, fieldsWithSignal: 1 });
    expect(r.confidence).toBe(PLATFORM_TIER_CONFIDENCE);
    expect(r.needsReview).toBe(true);
  });

  it('repetir o mesmo termo não compra confiança — só termos DISTINTOS contam', () => {
    const repetido = classifyDepartment({
      name: 'agent agent agent',
      description: 'agent agent agent agent agent',
      tags: ['agent', 'agent'],
    });
    expect(repetido.platformEvidence.distinctTerms).toBe(1);
    expect(repetido.confidence).toBe(PLATFORM_TIER_CONFIDENCE);
  });

  it('a confiança nunca ultrapassa o teto, por mais jargão que haja', () => {
    const saturado = classifyDepartment({
      name: 'agent skill llm prompt mcp claude codex cursor copilot gemini',
      description: 'openai anthropic chatgpt assistant model tool agentic prompting gpt',
      tags: ['ai', 'agents', 'skills', 'llms', 'tools', 'prompts'],
    });
    expect(saturado.platformEvidence.distinctTerms).toBeGreaterThan(15);
    expect(saturado.confidence).toBe(PLATFORM_TIER_MAX_CONFIDENCE);
    // Teto abaixo de curadoria humana: o tier infere "isto é ferramental",
    // nunca "isto é do departamento X" com a autoridade de uma pessoa.
    expect(saturado.confidence).toBeLessThan(1);
  });

  it('monotonicidade: acrescentar evidência jamais reduz a confiança', () => {
    const termos = ['agent', 'skill', 'llm', 'prompt', 'mcp', 'claude', 'codex'];
    let anterior = 0;
    for (let n = 1; n <= termos.length; n += 1) {
      const r = classifyDepartment({
        name: termos.slice(0, n).join(' '),
        tags: ['agents'],
      });
      expect(r.tier).toBe('platform');
      expect(r.confidence).toBeGreaterThanOrEqual(anterior);
      anterior = r.confidence;
    }
  });

  it('grade completa: 1..14 termos × 1..2 campos respeita piso, teto e limiar', () => {
    const vocab = [
      'agent', 'skill', 'llm', 'prompt', 'mcp', 'claude', 'codex',
      'cursor', 'copilot', 'gemini', 'openai', 'anthropic', 'chatgpt', 'assistant',
    ];
    let cenarios = 0;
    for (let n = 1; n <= vocab.length; n += 1) {
      for (const doisCampos of [false, true]) {
        const usados = vocab.slice(0, n);
        const r = classifyDepartment(
          doisCampos && usados.length > 1
            ? { name: usados.slice(0, -1).join(' '), tags: [usados[usados.length - 1]] }
            : { name: usados.join(' ') },
        );
        expect(r.tier).toBe('platform');
        expect(r.confidence).toBeGreaterThanOrEqual(PLATFORM_TIER_CONFIDENCE);
        expect(r.confidence).toBeLessThanOrEqual(PLATFORM_TIER_MAX_CONFIDENCE);
        if (r.platformEvidence.fieldsWithSignal < 2) {
          // Um campo só nunca conclui, independentemente do volume de jargão.
          expect(r.needsReview).toBe(true);
        }
        cenarios += 1;
      }
    }
    expect(cenarios).toBe(28);
  });
});
