import { DEPARTMENT_META, SKILL_DEPARTMENTS } from '@/config/skill-departments';
import { tokenize } from '@/services/skillRecommenderService';
import { classifyDepartment } from '@/services/skillDepartmentClassifier';
import { execSync } from 'child_process';

const rows = JSON.parse(execSync(
  `psql -tAc "select coalesce(json_agg(row_to_json(s)),'[]') from (select id,name,slug,description,tags,department from skill_registry) s"`,
).toString());

const known = new Set<string>();
for (const d of SKILL_DEPARTMENTS) for (const t of DEPARTMENT_META[d].lexicon) known.add(t);

const orphan = rows.filter((r: any) => {
  const c = classifyDepartment({ name: r.name, description: r.description ?? '', tags: r.tags ?? [] });
  return c.confidence < 0.18;
});
console.log('total', rows.length, 'baixa confiança', orphan.length, 'léxico', known.size);

const freq = new Map<string, number>();
for (const r of orphan) {
  const toks = new Set([...tokenize(`${r.name} ${r.description ?? ''}`), ...tokenize((r.tags ?? []).join(' '))]);
  for (const t of toks) if (!known.has(t) && t.length > 2) freq.set(t, (freq.get(t) ?? 0) + 1);
}
const top = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 45);
console.log('tokens fora do léxico:', freq.size);
console.log(top.map(([t, n]) => `${t}:${n}`).join('  '));
