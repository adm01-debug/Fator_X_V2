/**
 * Simulação exaustiva do livro-razão de evidências de prompt.
 *
 * Foco em três riscos reais: metadado malformado derrubando o painel,
 * checksum falso-positivo/negativo na verificação e agregação mentindo sobre
 * duplicatas ou evidência sintética.
 */
import { describe, it, expect } from 'vitest';
import {
  parseEvidenceRows,
  summarizeEvidenceLedger,
  verifyArtifactContent,
  isValidChecksum,
  type RawEvidenceRow,
} from '@/lib/skills/promptEvidenceLedger';
import { artifactChecksum } from '@/lib/skills/promptAuditArtifact';

function row(
  overrides: Partial<Record<string, unknown>> = {},
  meta: Record<string, unknown> = {},
): RawEvidenceRow {
  return {
    id: 'r1',
    created_at: '2026-07-01T10:00:00.000Z',
    entity_id: 'agent-1',
    metadata: {
      agent_name: 'Agente Alfa',
      model: 'gpt-x',
      filename: 'prompt-alfa.md',
      checksum: '0a1b2c3d',
      artifact_chars: 120,
      generated_at: '2026-07-01T09:59:00.000Z',
      ...meta,
    },
    ...overrides,
  };
}

describe('isValidChecksum', () => {
  it('aceita apenas 8 dígitos hex minúsculos', () => {
    expect(isValidChecksum('0a1b2c3d')).toBe(true);
    expect(isValidChecksum('0A1B2C3D')).toBe(false);
    expect(isValidChecksum('0a1b2c3')).toBe(false);
    expect(isValidChecksum('0a1b2c3dd')).toBe(false);
    expect(isValidChecksum('')).toBe(false);
    expect(isValidChecksum('zzzzzzzz')).toBe(false);
  });
});

describe('parseEvidenceRows — robustez', () => {
  it('descarta linhas sem checksum válido', () => {
    const linhas: RawEvidenceRow[] = [
      row(),
      row({ id: 'r2' }, { checksum: null }),
      row({ id: 'r3' }, { checksum: 'XYZ' }),
      { id: 'r4' },
      { metadata: 'string-solta' },
      { metadata: [1, 2, 3] },
    ];
    const out = parseEvidenceRows(linhas);
    expect(out).toHaveLength(1);
    expect(out[0].checksum).toBe('0a1b2c3d');
  });

  it('normaliza checksum maiúsculo antes de validar', () => {
    const out = parseEvidenceRows([row({}, { checksum: 'AABBCCDD' })]);
    expect(out).toHaveLength(1);
    expect(out[0].checksum).toBe('aabbccdd');
  });

  it('não produz NaN a partir de contagens corrompidas', () => {
    const out = parseEvidenceRows([
      row(
        {},
        {
          artifact_chars: 'muitos',
          skills_injected: -5,
          skills_overflow: 3.9,
          estimated_tokens: null,
          unresolved_variables: undefined,
        },
      ),
    ]);
    expect(out[0].artifactChars).toBe(0);
    expect(out[0].skillsInjected).toBe(0);
    expect(out[0].skillsOverflow).toBe(3);
    expect(out[0].estimatedTokens).toBe(0);
    expect(out[0].unresolvedVariables).toBe(0);
    expect(Object.values(out[0]).every((v) => !Number.isNaN(v as number))).toBe(true);
  });

  it('marca como sintética quando qualquer toggle de estresse foi usado', () => {
    const [a] = parseEvidenceRows([row({}, { forced_overflow: true })]);
    const [b] = parseEvidenceRows([row({}, { injected_dirty_skill: 'true' })]);
    const [c] = parseEvidenceRows([row()]);
    expect(a.synthetic).toBe(true);
    expect(b.synthetic).toBe(true);
    expect(c.synthetic).toBe(false);
  });

  it('trunca a lista de skills em overflow e ignora nomes vazios', () => {
    const nomes = Array.from({ length: 40 }, (_, i) => (i % 5 === 0 ? '   ' : `skill-${i}`));
    const [e] = parseEvidenceRows([row({}, { overflowed_skills: nomes })]);
    expect(e.overflowedSkills.length).toBeLessThanOrEqual(25);
    expect(e.overflowedSkills.every((n) => n.trim() !== '')).toBe(true);
  });

  it('cai para o createdAt quando generated_at é inválido', () => {
    const [e] = parseEvidenceRows([row({}, { generated_at: 'ontem' })]);
    expect(e.generatedAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('ordena do mais recente para o mais antigo', () => {
    const out = parseEvidenceRows([
      row({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ id: 'b', created_at: '2026-06-01T00:00:00.000Z' }),
      row({ id: 'c', created_at: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('suporta lote grande sem perder entradas válidas', () => {
    const lote: RawEvidenceRow[] = [];
    for (let i = 0; i < 600; i += 1) {
      const valido = i % 3 !== 0;
      lote.push(
        row(
          { id: `id-${i}`, created_at: new Date(1_780_000_000_000 + i * 1000).toISOString() },
          { checksum: valido ? artifactChecksum(`c-${i}`) : 'nope' },
        ),
      );
    }
    const out = parseEvidenceRows(lote);
    expect(out).toHaveLength(400);
  });
});

describe('summarizeEvidenceLedger', () => {
  it('resume zero entradas sem quebrar', () => {
    const s = summarizeEvidenceLedger([]);
    expect(s).toMatchObject({
      total: 0,
      agents: 0,
      withOverflow: 0,
      synthetic: 0,
      lastExportAt: null,
    });
    expect(s.duplicates).toEqual([]);
  });

  it('conta agentes distintos, overflow, sintéticas e não resolvidas', () => {
    const entries = parseEvidenceRows([
      row({ id: '1', entity_id: 'a1' }, { checksum: '11111111', skills_overflow: 4 }),
      row({ id: '2', entity_id: 'a1' }, { checksum: '22222222', forced_overflow: true }),
      row({ id: '3', entity_id: 'a2' }, { checksum: '33333333', unresolved_variables: 2 }),
    ]);
    const s = summarizeEvidenceLedger(entries);
    expect(s.total).toBe(3);
    expect(s.agents).toBe(2);
    expect(s.withOverflow).toBe(1);
    expect(s.synthetic).toBe(1);
    expect(s.withUnresolved).toBe(1);
  });

  it('detecta checksums duplicados ordenados por frequência', () => {
    const entries = parseEvidenceRows([
      row({ id: '1' }, { checksum: 'aaaaaaaa' }),
      row({ id: '2' }, { checksum: 'aaaaaaaa' }),
      row({ id: '3' }, { checksum: 'aaaaaaaa' }),
      row({ id: '4' }, { checksum: 'bbbbbbbb' }),
      row({ id: '5' }, { checksum: 'bbbbbbbb' }),
      row({ id: '6' }, { checksum: 'cccccccc' }),
    ]);
    const s = summarizeEvidenceLedger(entries);
    expect(s.duplicates.map((d) => [d.checksum, d.count])).toEqual([
      ['aaaaaaaa', 3],
      ['bbbbbbbb', 2],
    ]);
  });

  it('usa a maior data como última exportação mesmo fora de ordem', () => {
    const entries = parseEvidenceRows([
      row({ id: '1', created_at: '2026-02-01T00:00:00.000Z' }, { checksum: '11111111' }),
      row({ id: '2', created_at: '2026-09-09T00:00:00.000Z' }, { checksum: '22222222' }),
    ]);
    expect(summarizeEvidenceLedger(entries).lastExportAt).toBe('2026-09-09T00:00:00.000Z');
  });
});

describe('verifyArtifactContent', () => {
  const conteudo = '# Evidência\n\nprompt de teste com acentuação — çãé\n';
  const checksum = artifactChecksum(conteudo);
  const registradas = parseEvidenceRows([
    row({ id: 'ok' }, { checksum, artifact_chars: conteudo.length }),
  ]);

  it('trata conteúdo vazio como estado neutro', () => {
    for (const vazio of ['', '   ', '\n\t ']) {
      const r = verifyArtifactContent(vazio, registradas);
      expect(r.status).toBe('vazio');
      expect(r.matches).toEqual([]);
    }
  });

  it('reconhece artefato autêntico', () => {
    const r = verifyArtifactContent(conteudo, registradas);
    expect(r.status).toBe('autentico');
    expect(r.checksum).toBe(checksum);
    expect(r.matches).toHaveLength(1);
  });

  it('rejeita conteúdo alterado em um único caractere', () => {
    const r = verifyArtifactContent(conteudo.replace('teste', 'testc'), registradas);
    expect(r.status).toBe('desconhecido');
  });

  it('rejeita alteração invisível de espaçamento', () => {
    const r = verifyArtifactContent(`${conteudo} `, registradas);
    expect(r.status).toBe('desconhecido');
  });

  it('sinaliza divergência quando o checksum bate mas o tamanho não', () => {
    const enganosas = parseEvidenceRows([
      row({ id: 'x' }, { checksum, artifact_chars: conteudo.length + 10 }),
    ]);
    const r = verifyArtifactContent(conteudo, enganosas);
    expect(r.status).toBe('divergente');
  });

  it('não acusa divergência em registro legado sem tamanho', () => {
    const legado = parseEvidenceRows([row({ id: 'l' }, { checksum, artifact_chars: 0 })]);
    expect(verifyArtifactContent(conteudo, legado).status).toBe('autentico');
  });

  it('retorna todas as exportações do mesmo artefato', () => {
    const multiplas = parseEvidenceRows([
      row(
        { id: 'a', created_at: '2026-05-01T00:00:00.000Z' },
        { checksum, artifact_chars: conteudo.length },
      ),
      row(
        { id: 'b', created_at: '2026-06-01T00:00:00.000Z' },
        { checksum, artifact_chars: conteudo.length },
      ),
    ]);
    const r = verifyArtifactContent(conteudo, multiplas);
    expect(r.status).toBe('autentico');
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].id).toBe('b');
  });

  it('nunca casa por acaso em varredura de 400 conteúdos distintos', () => {
    const corpus = Array.from({ length: 400 }, (_, i) => `# artefato ${i}\ncorpo ${i}\n`);
    const entradas = parseEvidenceRows(
      corpus
        .slice(0, 200)
        .map((c, i) =>
          row({ id: `e-${i}` }, { checksum: artifactChecksum(c), artifact_chars: c.length }),
        ),
    );
    let autenticos = 0;
    let desconhecidos = 0;
    for (let i = 0; i < corpus.length; i += 1) {
      const st = verifyArtifactContent(corpus[i], entradas).status;
      if (st === 'autentico') autenticos += 1;
      if (st === 'desconhecido') desconhecidos += 1;
    }
    expect(autenticos).toBe(200);
    expect(desconhecidos).toBe(200);
  });

  it('lida com artefato muito grande sem estourar', () => {
    const grande = 'x'.repeat(500_000);
    const entradas = parseEvidenceRows([
      row({ id: 'g' }, { checksum: artifactChecksum(grande), artifact_chars: grande.length }),
    ]);
    const r = verifyArtifactContent(grande, entradas);
    expect(r.status).toBe('autentico');
    expect(r.chars).toBe(500_000);
  });
});
