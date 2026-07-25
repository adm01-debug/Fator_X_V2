import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { repairAlternation } from './alternation.ts';

Deno.test('colapsa runs consecutivos de user', () => {
  const r = repairAlternation([
    { role: 'user', content: 'Oi' },
    { role: 'user', content: 'boa tarde' },
    { role: 'user', content: 'quero orçamento' },
  ]);
  assertEquals(r.length, 1);
  assertEquals(r[0].role, 'user');
  assertEquals(r[0].content, 'Oi\n---\nboa tarde\n---\nquero orçamento');
});

Deno.test('mantém alternation válida intacta', () => {
  const r = repairAlternation([
    { role: 'user', content: 'A' },
    { role: 'assistant', content: 'B' },
    { role: 'user', content: 'C' },
  ]);
  assertEquals(r.map((t) => t.role), ['user', 'assistant', 'user']);
});

Deno.test('remove leading assistant e trailing assistant', () => {
  const r = repairAlternation([
    { role: 'assistant', content: 'órfão' },
    { role: 'user', content: 'A' },
    { role: 'assistant', content: 'B' },
    { role: 'assistant', content: 'C' },
  ]);
  assertEquals(r.map((t) => t.role), ['user']);
});

Deno.test('descarta vazios e system fica no topo', () => {
  const r = repairAlternation([
    { role: 'user', content: '   ' },
    { role: 'system', content: 'você é útil' },
    { role: 'user', content: 'Oi' },
  ]);
  assertEquals(r.map((t) => t.role), ['system', 'user']);
});

Deno.test('colapsa assistants consecutivos preservando conteúdo', () => {
  const r = repairAlternation([
    { role: 'user', content: 'A' },
    { role: 'assistant', content: 'B1' },
    { role: 'assistant', content: 'B2' },
    { role: 'user', content: 'C' },
  ]);
  assertEquals(r.length, 3);
  assertEquals(r[1].content, 'B1\n---\nB2');
});

Deno.test('endWithUser=false permite terminar com assistant', () => {
  const r = repairAlternation(
    [ { role: 'user', content: 'A' }, { role: 'assistant', content: 'B' } ],
    { endWithUser: false },
  );
  assertEquals(r.map((t) => t.role), ['user', 'assistant']);
});
