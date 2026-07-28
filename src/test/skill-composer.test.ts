import { describe, it, expect } from 'vitest';
import {
  skillDraftSchema,
  draftToSkillConfig,
  DEFAULT_DRAFT,
  type SkillDraft,
} from '@/lib/skillComposer/skillDraft';

// Rascunho publicável: além dos campos de metadados, o schema agora exige
// coerência semântica (output declarado + execução configurada).
const validDraft: SkillDraft = {
  ...DEFAULT_DRAFT,
  name: 'Skill Teste',
  slug: 'skill-teste',
  description: 'Uma descrição válida com mais de vinte caracteres para passar no schema.',
  category: 'tools',
  version: '1.0.0',
  tags: ['teste', 'demo'],
  outputs: [{ id: 'o1', name: 'resultado', type: 'string', description: 'Resultado' }],
  execution: {
    ...DEFAULT_DRAFT.execution,
    kind: 'http',
    http: { url: 'https://api.exemplo.com/v1', method: 'POST', headers: [], bodyTemplate: '' },
  },
};


describe('SkillComposer visual - schema', () => {
  it('aceita rascunho mínimo válido', () => {
    const r = skillDraftSchema.safeParse(validDraft);
    expect(r.success).toBe(true);
  });

  it('rejeita nome curto', () => {
    const r = skillDraftSchema.safeParse({ ...validDraft, name: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rejeita slug com maiúsculas', () => {
    const r = skillDraftSchema.safeParse({ ...validDraft, slug: 'Skill-Teste' });
    expect(r.success).toBe(false);
  });

  it('rejeita versão em formato inválido', () => {
    const r = skillDraftSchema.safeParse({ ...validDraft, version: '1.0' });
    expect(r.success).toBe(false);
  });

  it('rejeita mais de 8 tags', () => {
    const r = skillDraftSchema.safeParse({
      ...validDraft,
      tags: Array.from({ length: 9 }, (_, i) => `tag${i}`),
    });
    expect(r.success).toBe(false);
  });

  it('rejeita descrição muito curta', () => {
    const r = skillDraftSchema.safeParse({ ...validDraft, description: 'curto' });
    expect(r.success).toBe(false);
  });
});

describe('SkillComposer visual - draftToSkillConfig', () => {
  it('inclui somente o ramo de execução ativo', () => {
    const cfg = draftToSkillConfig({
      ...validDraft,
      execution: { ...validDraft.execution, kind: 'http' },
    });
    const execution = cfg.execution as Record<string, unknown>;
    expect(execution.kind).toBe('http');
    expect(execution.http).toBeDefined();
    expect(execution.llm).toBeUndefined();
    expect(execution.workflow).toBeUndefined();
  });

  it('serializa inputs com validações', () => {
    const cfg = draftToSkillConfig({
      ...validDraft,
      inputs: [
        {
          id: '1',
          name: 'email',
          type: 'string',
          required: true,
          description: 'Email do contato',
          defaultValue: '',
          validation: {
            pattern: '^.+@.+$',
            enumValues: [],
          },
        },
      ],
    });
    const inputs = cfg.inputs as Array<Record<string, unknown>>;
    expect(inputs).toHaveLength(1);
    expect(inputs[0].name).toBe('email');
    const validation = inputs[0].validation as Record<string, unknown>;
    expect(validation.pattern).toBe('^.+@.+$');
  });
});
