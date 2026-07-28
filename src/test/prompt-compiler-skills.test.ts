import { describe, it, expect } from 'vitest';
import {
  buildSkillsSection,
  compilePrompt,
  MAX_PROMPT_SKILLS,
  type PromptSkill,
} from '@/lib/promptCompiler';

const base = {
  name: 'Nexus',
  emoji: '🤖',
  mission: 'Apoiar o time comercial',
  type: 'assistant',
  model: 'gpt-5',
  prompt: 'Você é um assistente objetivo.',
};

describe('buildSkillsSection', () => {
  it('retorna vazio sem skills', () => {
    expect(buildSkillsSection(undefined)).toBe('');
    expect(buildSkillsSection([])).toBe('');
  });

  it('ignora skills sem nome utilizável', () => {
    expect(buildSkillsSection([{ name: '   ' }, { name: '<b></b>' }])).toBe('');
  });

  it('ordena alfabeticamente e formata categoria e descrição', () => {
    const out = buildSkillsSection([
      { id: 'b', name: 'Zapier', description: 'Automação', category: 'integrations' },
      { id: 'a', name: 'Busca CRM', description: 'Consulta leads', category: 'tools' },
    ]);
    const lines = out.split('\n').filter((l) => l.startsWith('- '));
    expect(lines[0]).toBe('- **Busca CRM** _(tools)_ — Consulta leads');
    expect(lines[1]).toBe('- **Zapier** _(integrations)_ — Automação');
  });

  it('deduplica por id e, sem id, por nome normalizado', () => {
    const out = buildSkillsSection([
      { id: 'x', name: 'Skill A' },
      { id: 'x', name: 'Skill A duplicada' },
      { name: 'Skill B' },
      { name: 'skill b' },
    ]);
    expect(out.split('\n').filter((l) => l.startsWith('- ')).length).toBe(2);
  });

  it('sanitiza HTML e quebras de linha', () => {
    const out = buildSkillsSection([
      { id: '1', name: 'Ex<script>alert(1)</script>', description: 'linha1\nlinha2' },
    ]);
    expect(out).not.toContain('<script>');
    expect(out).toContain('linha1 linha2');
  });

  it('trunca descrições muito longas', () => {
    const out = buildSkillsSection([{ id: '1', name: 'S', description: 'a'.repeat(400) }]);
    expect(out).toContain('…');
    expect(out.length).toBeLessThan(300);
  });

  it('aplica cap e informa overflow', () => {
    const many: PromptSkill[] = Array.from({ length: MAX_PROMPT_SKILLS + 7 }, (_, i) => ({
      id: `s${i}`,
      name: `Skill ${String(i).padStart(3, '0')}`,
    }));
    const out = buildSkillsSection(many);
    const items = out.split('\n').filter((l) => l.startsWith('- '));
    expect(items.length).toBe(MAX_PROMPT_SKILLS + 1);
    expect(items[items.length - 1]).toContain('+7 skills adicionais');
  });

  it('é determinístico independentemente da ordem de entrada', () => {
    const skills: PromptSkill[] = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
      { id: '3', name: 'Gamma' },
    ];
    expect(buildSkillsSection(skills)).toBe(buildSkillsSection([...skills].reverse()));
  });
});

describe('compilePrompt com skills', () => {
  it('não altera o prompt quando não há skills', () => {
    const semSkills = compilePrompt(base).text;
    const comArrayVazio = compilePrompt({ ...base, skills: [] }).text;
    expect(semSkills).toBe(comArrayVazio);
  });

  it('injeta a seção antes da linha de meta', () => {
    const { text } = compilePrompt({
      ...base,
      skills: [{ id: '1', name: 'Busca CRM', category: 'tools' }],
    });
    expect(text).toContain('## Skills disponíveis');
    expect(text.indexOf('## Skills disponíveis')).toBeLessThan(text.indexOf('<!-- meta:'));
  });

  it('contabiliza as skills nas estatísticas de tokens', () => {
    const sem = compilePrompt(base);
    const com = compilePrompt({ ...base, skills: [{ id: '1', name: 'Busca CRM' }] });
    expect(com.stats.estimatedTokens).toBeGreaterThan(sem.stats.estimatedTokens);
    expect(com.stats.chars).toBe(com.text.length);
  });

  it('preserva a interpolação de variáveis', () => {
    const { text, unresolvedVariables } = compilePrompt({
      ...base,
      prompt: 'Missão: {{mission}}. Hoje: {{date}}.',
      skills: [{ id: '1', name: 'Busca CRM' }],
    });
    expect(text).toContain('Missão: Apoiar o time comercial.');
    expect(unresolvedVariables).toEqual([]);
  });
});
