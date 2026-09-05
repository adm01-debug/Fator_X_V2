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

describe('SkillComposer visual - invariantes semânticas', () => {
  it('rejeita nomes de input duplicados', () => {
    const input = {
      id: 'i1',
      name: 'campo',
      type: 'string' as const,
      required: false,
      description: '',
      defaultValue: '',
      validation: { pattern: '', enumValues: [] },
    };
    const r = skillDraftSchema.safeParse({
      ...validDraft,
      inputs: [input, { ...input, id: 'i2' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita draft sem outputs', () => {
    const r = skillDraftSchema.safeParse({ ...validDraft, outputs: [] });
    expect(r.success).toBe(false);
  });

  it('rejeita URL HTTP não segura', () => {
    const r = skillDraftSchema.safeParse({
      ...validDraft,
      execution: {
        ...validDraft.execution,
        http: { ...validDraft.execution.http, url: 'http://api.exemplo.com' },
      },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita segredo literal em header e aceita referência de variável', () => {
    const withSecret = skillDraftSchema.safeParse({
      ...validDraft,
      execution: {
        ...validDraft.execution,
        http: {
          ...validDraft.execution.http,
          headers: [{ key: 'Authorization', value: 'Bearer sk-live-abc123def456ghi789' }],
        },
      },
    });
    expect(withSecret.success).toBe(false);
    const withVar = skillDraftSchema.safeParse({
      ...validDraft,
      execution: {
        ...validDraft.execution,
        http: {
          ...validDraft.execution.http,
          headers: [{ key: 'Authorization', value: 'Bearer {{API_KEY}}' }],
        },
      },
    });
    expect(withVar.success).toBe(true);
  });

  it('rejeita placeholder não declarado e regex inválida', () => {
    const orphan = skillDraftSchema.safeParse({
      ...validDraft,
      prompt: { systemMessage: '', template: 'Use {{nao_declarado}}' },
    });
    expect(orphan.success).toBe(false);
    const badRegex = skillDraftSchema.safeParse({
      ...validDraft,
      inputs: [
        {
          id: 'i1',
          name: 'campo',
          type: 'string' as const,
          required: false,
          description: '',
          defaultValue: '',
          validation: { pattern: '([a-z', enumValues: [] },
        },
      ],
    });
    expect(badRegex.success).toBe(false);
  });

  it('aceita kind divergente enquanto não configurado (rascunho)', () => {
    const r = skillDraftSchema.safeParse({
      ...validDraft,
      category: 'knowledge',
      execution: {
        ...validDraft.execution,
        kind: 'rag',
        rag: { collection: 'docs', topK: 5, minScore: 0.6 },
        http: { url: '', method: 'POST', headers: [], bodyTemplate: '' },
      },
    });
    expect(r.success).toBe(true);
  });
});
