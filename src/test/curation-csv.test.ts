import { describe, it, expect } from 'vitest';
import {
  buildCurationCsv,
  buildCurationCsvFilename,
  escapeCsvField,
  CURATION_CSV_HEADER,
  type CurationFeedDay,
  type CurationFeedEntry,
} from '@/services/templateSkillLinkService';

/**
 * Parser CSV mínimo (RFC 4180) usado apenas como oráculo dos testes.
 * Reimplementar aqui é intencional: validar o serializador contra a mesma
 * função que o produz não provaria nada.
 */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let emAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      emAspas = true;
    } else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\r' && texto[i + 1] === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
      i++;
    } else {
      campo += c;
    }
  }
  linha.push(campo);
  linhas.push(linha);
  return linhas;
}

function entry(over: Partial<CurationFeedEntry> = {}): CurationFeedEntry {
  return {
    kind: 'linked',
    templateId: 'tpl-1',
    templateName: 'Financeiro',
    skillId: 'skill-1',
    skillName: 'Conciliação',
    reason: 'curadoria manual',
    actorId: 'u1',
    actorLabel: 'você',
    at: '2026-07-27T10:00:00Z',
    timeLabel: '07:00',
    ...over,
  };
}

function day(entries: CurationFeedEntry[], dayKey = '2026-07-27'): CurationFeedDay {
  return { dayKey, dayLabel: 'Hoje', entries };
}

describe('escapeCsvField — estrutura RFC 4180', () => {
  it('não cita valores simples', () => {
    expect(escapeCsvField('abc')).toBe('abc');
  });

  it('cita e dobra aspas internas', () => {
    expect(escapeCsvField('diz "oi"')).toBe('"diz ""oi"""');
  });

  it.each([',', '\n', '\r\n', '"'])('cita quando contém %j', (ch) => {
    expect(escapeCsvField(`a${ch}b`).startsWith('"')).toBe(true);
  });

  it('trata null/undefined como vazio', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('remove caracteres de controle não imprimíveis', () => {
    expect(escapeCsvField('a\u0000\u0007b')).toBe('ab');
  });
});

describe('escapeCsvField — injeção de fórmula', () => {
  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'neutraliza prefixo perigoso %j',
    (prefixo) => {
      const saida = escapeCsvField(`${prefixo}cmd|'/c calc'!A1`);
      const valor = saida.startsWith('"') ? saida.slice(1, -1).replace(/""/g, '"') : saida;
      expect(valor.startsWith("'")).toBe(true);
    },
  );

  it('não prefixa valores inofensivos que apenas contêm = no meio', () => {
    expect(escapeCsvField('a=b')).toBe('a=b');
  });
});

describe('buildCurationCsv', () => {
  it('emite apenas o cabeçalho quando o feed está vazio', () => {
    expect(buildCurationCsv([])).toBe(CURATION_CSV_HEADER.join(','));
  });

  it('tolera feed nulo e dias sem entradas', () => {
    expect(buildCurationCsv(null as unknown as CurationFeedDay[])).toBe(
      CURATION_CSV_HEADER.join(','),
    );
    expect(buildCurationCsv([day([])])).toBe(CURATION_CSV_HEADER.join(','));
  });

  it('traduz o tipo de evento para PT-BR', () => {
    const csv = parseCsv(buildCurationCsv([day([entry(), entry({ kind: 'unlinked' })])]));
    expect(csv[1][2]).toBe('Vínculo');
    expect(csv[2][2]).toBe('Remoção');
  });

  it('preserva a ordem dos dias e das entradas', () => {
    const csv = parseCsv(
      buildCurationCsv([
        day([entry({ skillId: 'a' })], '2026-07-27'),
        day([entry({ skillId: 'b' })], '2026-07-26'),
      ]),
    );
    expect(csv.slice(1).map((l) => [l[0], l[5]])).toEqual([
      ['2026-07-27', 'a'],
      ['2026-07-26', 'b'],
    ]);
  });

  it('usa CRLF entre registros', () => {
    expect(buildCurationCsv([day([entry()])])).toContain('\r\n');
  });

  it('mantém campos ausentes como vazios sem deslocar colunas', () => {
    const csv = parseCsv(
      buildCurationCsv([day([entry({ timeLabel: null, actorLabel: null })])]),
    );
    expect(csv[1][1]).toBe('');
    expect(csv[1][8]).toBe('');
    expect(csv[1]).toHaveLength(CURATION_CSV_HEADER.length);
  });
});

describe('buildCurationCsv — fuzzing de integridade estrutural', () => {
  const RUIDO = [
    ',',
    '"',
    '""',
    '\n',
    '\r\n',
    '\t',
    '=SUM(A1)',
    '+1',
    '-1',
    '@import',
    ';DROP TABLE',
    'çãé',
    '💥',
    '\u0000',
    "'",
    '   ',
    '',
  ];

  function ruidoAleatorio(seed: number): string {
    let s = '';
    const n = seed % 4;
    for (let i = 0; i <= n; i++) s += RUIDO[(seed * (i + 7)) % RUIDO.length];
    return s;
  }

  it('500 feeds contaminados continuam com o número exato de colunas', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const entradas = Array.from({ length: (seed % 3) + 1 }, (_, i) =>
        entry({
          kind: (seed + i) % 2 === 0 ? 'linked' : 'unlinked',
          templateId: ruidoAleatorio(seed + i),
          templateName: ruidoAleatorio(seed * 3 + i),
          skillId: ruidoAleatorio(seed * 5 + i),
          skillName: ruidoAleatorio(seed * 7 + i),
          reason: ruidoAleatorio(seed * 11 + i),
          actorLabel: seed % 5 === 0 ? null : ruidoAleatorio(seed * 13 + i),
          timeLabel: seed % 7 === 0 ? null : '10:30',
        }),
      );

      const linhas = parseCsv(buildCurationCsv([day(entradas)]));
      expect(linhas).toHaveLength(entradas.length + 1);
      for (const linha of linhas) {
        expect(linha).toHaveLength(CURATION_CSV_HEADER.length);
      }
    }
  });

  it('nenhuma célula exportada começa com caractere executável por planilha', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const csv = parseCsv(
        buildCurationCsv([
          day([
            entry({
              reason: ruidoAleatorio(seed),
              skillName: ruidoAleatorio(seed * 2),
              templateName: ruidoAleatorio(seed * 3),
            }),
          ]),
        ]),
      );
      for (const celula of csv[1]) {
        expect(/^[=+\-@\t\r]/.test(celula)).toBe(false);
      }
    }
  });

  it('round-trip: o valor sanitizado é recuperável sem perda estrutural', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const motivo = ruidoAleatorio(seed);
      const csv = parseCsv(buildCurationCsv([day([entry({ reason: motivo })])]));
      const esperado = motivo.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
      const obtido = csv[1][7];
      expect(obtido === esperado || obtido === `'${esperado}`).toBe(true);
    }
  });
});

describe('buildCurationCsvFilename', () => {
  it('é determinístico e ordenável', () => {
    expect(buildCurationCsvFilename(new Date(2026, 6, 27, 9, 5))).toBe(
      'curadoria-2026-07-27-0905.csv',
    );
  });

  it('não quebra com data inválida', () => {
    expect(buildCurationCsvFilename(new Date('x'))).toMatch(/^curadoria-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
  });
});
