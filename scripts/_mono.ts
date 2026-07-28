import { DEPARTMENT_META, SKILL_DEPARTMENTS } from '@/config/skill-departments';
import { classifyDepartment } from '@/services/skillDepartmentClassifier';
import { execSync } from 'child_process';

const rows = JSON.parse(execSync(
  `psql -tAc "select coalesce(json_agg(row_to_json(s)),'[]') from (select name,slug,description,tags from skill_registry) s"`,
).toString()) as Array<{ name: string; slug: string; description: string | null; tags: string[] | null }>;

// INVARIANTE: acrescentar um termo do léxico do departamento D às tags nunca
// pode REDUZIR o score de D. Se reduz, o scorer pune quem enriquece metadados.
let viol = 0, testes = 0;
const exemplos: string[] = [];
for (const r of rows) {
  const base = { name: r.name, description: r.description ?? '', tags: r.tags ?? [] };
  for (const dep of SKILL_DEPARTMENTS) {
    const termo = DEPARTMENT_META[dep].lexicon[0];
    const antes = classifyDepartment(base).ranking.find((x) => x.department === dep)!.score;
    const depois = classifyDepartment({ ...base, tags: [...base.tags, termo] }).ranking
      .find((x) => x.department === dep)!.score;
    testes++;
    if (depois < antes - 1e-9) {
      viol++;
      if (exemplos.length < 5) exemplos.push(`${r.slug} +"${termo}"(${dep}): ${antes.toFixed(3)} -> ${depois.toFixed(3)}`);
    }
  }
}
console.log(`testes=${testes} violações=${viol} (${((viol / testes) * 100).toFixed(1)}%)`);
exemplos.forEach((e) => console.log('  ', e));
