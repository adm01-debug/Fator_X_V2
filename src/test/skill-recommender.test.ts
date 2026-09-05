import { describe, it, expect } from 'vitest';
import { recommendSkills, tokenize, expandTokens } from '@/services/skillRecommenderService';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

function makeSkill(overrides: Partial<AgentSkillDefinition> = {}): AgentSkillDefinition {
  return {
    id: overrides.id ?? 'skill-1',
    name: 'CRM Search',
    slug: 'crm-search',
    description: 'Busca contatos e leads no CRM Salesforce',
    version: '1.0.0',
    author: 'test',
    category: 'integrations',
    tags: ['crm', 'salesforce', 'contatos'],
    install_count: 100,
    rating: 4.5,
    skill_config: {},
    is_verified: true,
    is_public: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('skillRecommenderService', () => {
  it('tokeniza texto removendo acentos e stopwords', () => {
    const tokens = tokenize('Buscar contatos no CRM da empresa');
    expect(tokens.has('buscar')).toBe(true);
    expect(tokens.has('contatos')).toBe(true);
    expect(tokens.has('crm')).toBe(true);
    expect(tokens.has('no')).toBe(false); // stopword
    expect(tokens.has('da')).toBe(false); // stopword
  });

  it('retorna vazio quando missão está vazia', () => {
    const skills = [makeSkill()];
    const recs = recommendSkills({ mission: '' }, skills);
    expect(recs).toEqual([]);
  });

  it('retorna vazio quando registry está vazio', () => {
    const recs = recommendSkills({ mission: 'busca crm' }, []);
    expect(recs).toEqual([]);
  });

  it('recomenda skill com alto match de keywords', () => {
    const skills = [
      makeSkill({
        id: 'a',
        name: 'CRM Contacts',
        description: 'Busca contatos CRM',
        tags: ['crm'],
      }),
      makeSkill({
        id: 'b',
        name: 'Weather API',
        description: 'Clima e previsão',
        tags: ['weather'],
      }),
    ];
    const recs = recommendSkills({ mission: 'buscar contatos no crm' }, skills);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].skill.id).toBe('a');
    expect(recs[0].matchedKeywords.length).toBeGreaterThan(0);
  });

  it('respeita hard cap de top-N', () => {
    const skills = Array.from({ length: 20 }, (_, i) =>
      makeSkill({
        id: `s${i}`,
        name: `CRM Skill ${i}`,
        description: 'crm contatos leads',
        tags: ['crm'],
      }),
    );
    const recs = recommendSkills({ mission: 'crm contatos' }, skills, 5);
    expect(recs.length).toBeLessThanOrEqual(5);
  });

  it('tie-break usa install_count decrescente', () => {
    const skills = [
      makeSkill({
        id: 'low',
        install_count: 10,
        name: 'CRM A',
        description: 'crm contatos',
        tags: ['crm'],
      }),
      makeSkill({
        id: 'high',
        install_count: 999,
        name: 'CRM B',
        description: 'crm contatos',
        tags: ['crm'],
      }),
    ];
    const recs = recommendSkills({ mission: 'crm contatos' }, skills);
    expect(recs[0].skill.id).toBe('high');
  });

  it('score fica entre 0 e 1', () => {
    const skills = [makeSkill()];
    const recs = recommendSkills({ mission: 'crm salesforce contatos' }, skills);
    for (const r of recs) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('skillRecommenderService — sinônimos e baseline', () => {
  it('expande tokens PT-BR para equivalentes em inglês', () => {
    const expanded = expandTokens(tokenize('gerenciar vendas e suporte'));
    expect(expanded.has('sales')).toBe(true);
    expect(expanded.has('support')).toBe(true);
    expect(expanded.has('vendas')).toBe(true);
  });

  it('recomenda skill em inglês para missão escrita em português', () => {
    const skills = [
      makeSkill({
        id: 'en-1',
        name: 'Sales Pipeline Sync',
        slug: 'sales-pipeline',
        description: 'Sync sales pipeline',
        tags: ['sales'],
      }),
      makeSkill({
        id: 'other',
        name: 'Image Resizer',
        slug: 'image-resizer',
        description: 'Redimensiona imagens',
        tags: ['image'],
        category: 'tools',
      }),
    ];
    const recs = recommendSkills({ mission: 'acompanhar vendas do time' }, skills);
    expect(recs[0]?.skill.id).toBe('en-1');
  });

  it('não preenche baseline por padrão', () => {
    const skills = [
      makeSkill({ id: 'a', name: 'Alpha', slug: 'alpha', description: 'nada a ver', tags: [] }),
    ];
    const recs = recommendSkills({ mission: 'zzzz qqqq wwww' }, skills, 5);
    expect(recs).toHaveLength(0);
  });

  it('preenche baseline priorizando verificadas e populares quando solicitado', () => {
    const skills = [
      makeSkill({
        id: 'pop',
        name: 'Alpha',
        slug: 'alpha',
        description: 'nada a ver',
        tags: [],
        install_count: 900,
        is_verified: true,
      }),
      makeSkill({
        id: 'low',
        name: 'Beta',
        slug: 'beta',
        description: 'nada a ver',
        tags: [],
        install_count: 5,
        is_verified: false,
      }),
    ];
    const recs = recommendSkills({ mission: 'zzzz qqqq wwww' }, skills, 2, { fillBaseline: true });
    expect(recs.map((r) => r.skill.id)).toEqual(['pop', 'low']);
    expect(recs[0].score).toBe(0);
  });

  it('não duplica skills já ranqueadas ao preencher baseline', () => {
    const skills = [
      makeSkill({
        id: 'crm',
        name: 'CRM Search',
        slug: 'crm-search',
        description: 'Busca leads no CRM',
        tags: ['crm'],
        install_count: 10,
      }),
      makeSkill({
        id: 'pop',
        name: 'Alpha',
        slug: 'alpha',
        description: 'nada',
        tags: [],
        install_count: 900,
      }),
    ];
    const recs = recommendSkills({ mission: 'buscar leads no crm' }, skills, 5, {
      fillBaseline: true,
    });
    const ids = recs.map((r) => r.skill.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('crm');
  });
});
