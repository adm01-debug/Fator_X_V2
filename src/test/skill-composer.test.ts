import { describe, it, expect } from 'vitest';
import { skillComposerSchema, slugify } from '@/pages/SkillComposerPage';

describe('SkillComposer - slugify', () => {
  it('converte para lowercase com hífen', () => {
    expect(slugify('Buscador CRM Pro')).toBe('buscador-crm-pro');
  });
  it('remove acentos', () => {
    expect(slugify('Automação Fácil')).toBe('automacao-facil');
  });
  it('remove caracteres especiais', () => {
    expect(slugify('Skill @#$ Test!')).toBe('skill-test');
  });
  it('trunca em 80 caracteres', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});

describe('SkillComposer - schema', () => {
  const valid = {
    name: 'Skill Teste',
    slug: 'skill-teste',
    description: 'Uma descrição válida com mais de vinte caracteres para passar no schema.',
    category: 'tools' as const,
    version: '1.0.0',
    tags: ['teste', 'demo'],
    configJson: '{"foo": "bar"}',
  };

  it('aceita entrada válida', () => {
    const r = skillComposerSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejeita nome curto', () => {
    const r = skillComposerSchema.safeParse({ ...valid, name: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rejeita slug com maiúsculas', () => {
    const r = skillComposerSchema.safeParse({ ...valid, slug: 'Skill-Teste' });
    expect(r.success).toBe(false);
  });

  it('rejeita versão em formato inválido', () => {
    const r = skillComposerSchema.safeParse({ ...valid, version: '1.0' });
    expect(r.success).toBe(false);
  });

  it('rejeita JSON de configuração inválido', () => {
    const r = skillComposerSchema.safeParse({ ...valid, configJson: '{invalid}' });
    expect(r.success).toBe(false);
  });

  it('rejeita mais de 8 tags', () => {
    const r = skillComposerSchema.safeParse({
      ...valid,
      tags: Array.from({ length: 9 }, (_, i) => `tag${i}`),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita descrição muito curta', () => {
    const r = skillComposerSchema.safeParse({ ...valid, description: 'curto' });
    expect(r.success).toBe(false);
  });
});
