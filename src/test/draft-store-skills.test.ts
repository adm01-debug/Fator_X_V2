/**
 * Persistência das skills selecionadas no rascunho do QuickCreateWizard.
 * Cenários de falha previstos: localStorage corrompido, IDs não-string,
 * duplicatas, IDs gigantes (DoS de storage) e excesso de itens.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { upsertDraft, loadDrafts, saveDrafts, DRAFTS_KEY, MAX_DRAFT_SKILL_IDS, type DraftsStoreV2 } from '@/components/agents/wizard/draftStore';
import { QUICK_AGENT_DEFAULTS } from '@/lib/validations/quickAgentSchema';

const form = { ...QUICK_AGENT_DEFAULTS, name: 'Ana', mission: 'Missão de teste válida' };
const empty = (): DraftsStoreV2 => ({ version: 2, activeId: null, drafts: [] });

describe('draftStore — selectedSkillIds', () => {
  beforeEach(() => localStorage.clear());

  it('persiste e recarrega os IDs selecionados', () => {
    const { store, id } = upsertDraft(empty(), { form, selectedSkillIds: ['s1', 's2'] });
    saveDrafts(store);
    const back = loadDrafts();
    expect(back.drafts.find((d) => d.id === id)?.selectedSkillIds).toEqual(['s1', 's2']);
  });

  it('preserva a seleção existente quando o campo é omitido no upsert', () => {
    const first = upsertDraft(empty(), { form, selectedSkillIds: ['s1'] });
    const second = upsertDraft(first.store, { id: first.id, form });
    expect(second.store.drafts[0].selectedSkillIds).toEqual(['s1']);
  });

  it('sobrescreve com lista vazia quando explicitamente informado', () => {
    const first = upsertDraft(empty(), { form, selectedSkillIds: ['s1'] });
    const second = upsertDraft(first.store, { id: first.id, form, selectedSkillIds: [] });
    expect(second.store.drafts[0].selectedSkillIds).toEqual([]);
  });

  it('sanitiza payload corrompido no localStorage', () => {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({
      version: 2,
      activeId: 'x',
      drafts: [{ id: 'x', form, savedAt: new Date().toISOString(), selectedSkillIds: ['ok', 'ok', 42, null, '   ', 'a'.repeat(90)] }],
    }));
    expect(loadDrafts().drafts[0].selectedSkillIds).toEqual(['ok']);
  });

  it('trata selectedSkillIds não-array como vazio', () => {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({
      version: 2, activeId: null,
      drafts: [{ id: 'x', form, savedAt: new Date().toISOString(), selectedSkillIds: 'nope' }],
    }));
    expect(loadDrafts().drafts[0].selectedSkillIds).toEqual([]);
  });

  it('limita a MAX_DRAFT_SKILL_IDS', () => {
    const many = Array.from({ length: MAX_DRAFT_SKILL_IDS + 40 }, (_, i) => `s${i}`);
    const { store } = upsertDraft(empty(), { form, selectedSkillIds: many });
    expect(store.drafts[0].selectedSkillIds).toHaveLength(MAX_DRAFT_SKILL_IDS);
  });
});
