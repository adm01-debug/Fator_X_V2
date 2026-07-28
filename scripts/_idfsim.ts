import { DEPARTMENT_META, SKILL_DEPARTMENTS } from '@/config/skill-departments';
import { tokenize } from '@/services/skillRecommenderService';
import { execSync } from 'child_process';

const rows = JSON.parse(execSync(
  `psql -tAc "select coalesce(json_agg(row_to_json(s)),'[]') from (select id,name,slug,description,tags,department from skill_registry) s"`,
).toString()) as Array<{ name: string; description: string | null; tags: string[] | null }>;

const LEX: Record<string, Set<string>> = Object.fromEntries(
  SKILL_DEPARTMENTS.map((d) => [d, new Set(DEPARTMENT_META[d].lexicon)]),
);

const docs = rows.map((r) => ({
  r,
  prim: tokenize(`${r.name} ${r.description ?? ''}`),
  tags: tokenize((r.tags ?? []).join(' ')),
}));

// Document frequency sobre o corpus inteiro.
const df = new Map<string, number>();
for (const d of docs) for (const t of new Set([...d.prim, ...d.tags])) df.set(t, (df.get(t) ?? 0) + 1);
const N = docs.length;

function hit(tokens: Set<string>, lex: Set<string>, maxDf: number) {
  const kept = [...tokens].filter((t) => (df.get(t) ?? 0) / N <= maxDf);
  if (kept.length === 0) return 0;
  const hits = kept.filter((t) => lex.has(t)).length;
  return Math.min(1, hits / Math.sqrt(kept.length));
}

function score(d: (typeof docs)[number], maxDf: number) {
  const rk = SKILL_DEPARTMENTS.map((dep) => ({
    dep,
    s: 0.65 * hit(d.prim, LEX[dep], maxDf) + 0.35 * hit(d.tags, LEX[dep], maxDf),
  })).sort((a, b) => b.s - a.s);
  return { best: rk[0], second: rk[1] };
}

console.log('maxDf | conf>=0.18 | margem>=0.08 | conf média');
for (const maxDf of [1.0, 0.5, 0.3, 0.2, 0.15, 0.1, 0.07, 0.05, 0.03]) {
  let ok = 0, marg = 0, sum = 0;
  for (const d of docs) {
    const { best, second } = score(d, maxDf);
    sum += best.s;
    if (best.s >= 0.18) ok++;
    if (best.s >= 0.18 && best.s - second.s >= 0.08) marg++;
  }
  console.log(
    `${maxDf.toFixed(2)}  |    ${String(ok).padStart(3)}     |     ${String(marg).padStart(3)}      | ${(sum / N).toFixed(3)}`,
  );
}
