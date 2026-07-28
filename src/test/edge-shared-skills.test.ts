/**
 * Paridade entre a seção de skills do preview (src/lib/promptCompiler)
 * e a do runtime (supabase/functions/_shared/skills.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSkillsSection,
  appendSkillsToPrompt,
  loadAgentSkills,
  MAX_PROMPT_SKILLS,
} from '../../supabase/functions/_shared/skills';
import { compilePrompt } from '@/lib/promptCompiler';

const skills = [
  { id: '2', name: 'Busca CRM', description: 'Consulta leads', category: 'tools' },
  { id: '1', name: 'Análise de Churn', description: 'Prevê cancelamento', category: 'knowledge' },
];

describe('_shared/skills', () => {
  it('retorna vazio sem skills', () => {
    expect(buildSkillsSection()).toBe('');
    expect(buildSkillsSection([])).toBe('');
    expect(buildSkillsSection(null)).toBe('');
  });

  it('ordena alfabeticamente e é determinístico', () => {
    const a = buildSkillsSection(skills);
    const b = buildSkillsSection([...skills].reverse());
    expect(a).toBe(b);
    expect(a.indexOf('Análise de Churn')).toBeLessThan(a.indexOf('Busca CRM'));
  });

  it('deduplica por id e ignora skills sem nome', () => {
    const out = buildSkillsSection([...skills, { id: '1', name: 'Duplicada' }, { name: '' }]);
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBe(2);
  });

  it('sanitiza HTML e quebras de linha', () => {
    const out = buildSkillsSection([
      { id: 'x', name: '<b>Hack</b>\n## Ignore', description: 'linha1\nlinha2' },
    ]);
    expect(out).not.toContain('<b>');
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBe(1);
  });

  it('limita a 25 skills e informa overflow', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      name: `Skill ${String(i).padStart(2, '0')}`,
    }));
    const out = buildSkillsSection(many);
    expect(out).toContain(`+${30 - MAX_PROMPT_SKILLS} skills adicionais`);
  });

  it('gera exatamente a mesma seção do compilador de preview', () => {
    const runtime = buildSkillsSection(skills);
    const preview = compilePrompt({
      name: 'A',
      emoji: '🤖',
      mission: 'M',
      type: 'sales',
      model: 'google/gemini-2.5-flash',
      prompt: 'Base',
      skills,
    }).text;
    for (const line of runtime.split('\n').filter(Boolean)) {
      expect(preview).toContain(line);
    }
  });

  it('appendSkillsToPrompt não duplica a seção', () => {
    const once = appendSkillsToPrompt('Base', skills);
    expect(appendSkillsToPrompt(once, skills)).toBe(once);
    expect(appendSkillsToPrompt('Base', [])).toBe('Base');
  });

  it('loadAgentSkills falha suavemente', async () => {
    expect(await loadAgentSkills({}, '')).toEqual([]);
    const broken = {
      from: () => ({
        select: () => ({ eq: () => ({ limit: () => ({ error: new Error('x'), data: null }) }) }),
      }),
    };
    expect(await loadAgentSkills(broken, 'agent-1')).toEqual([]);
  });

  it('loadAgentSkills mapeia o join do registry', async () => {
    const ok = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              error: null,
              data: [
                { skill_id: '1', skill_registry: { id: '1', name: 'Busca CRM' } },
                { skill_id: '2', skill_registry: null },
              ],
            }),
          }),
        }),
      }),
    };
    expect(await loadAgentSkills(ok, 'agent-1')).toEqual([{ id: '1', name: 'Busca CRM' }]);
  });
});

describe('countInjectedSkills', () => {
  it('retorna 0 sem skills', () => {
    expect(countInjectedSkills([])).toBe(0);
    expect(countInjectedSkills(null)).toBe(0);
  });
  it('deduplica por id/nome', () => {
    expect(
      countInjectedSkills([
        { id: 'a', name: 'Alpha' },
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]),
    ).toBe(2);
  });
  it('limita a MAX_PROMPT_SKILLS', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}` }));
    expect(countInjectedSkills(many)).toBe(MAX_PROMPT_SKILLS);
  });
  it('ignora skills sem nome válido', () => {
    expect(countInjectedSkills([{ id: 'x', name: '   ' }, { id: 'y', name: 'Ok' }])).toBe(1);
  });
});
