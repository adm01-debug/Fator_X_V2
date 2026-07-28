/**
 * Harness determinístico de cobertura Template ↔ Skill.
 *
 * Objetivo: simular o resultado de `linkSkillsToTemplate` para TODOS os
 * templates contra o catálogo real do Registry (lido do banco via stdin JSON),
 * detectando gaps ANTES de qualquer escrita:
 *
 *   G1 — templates sem nenhum vínculo (agente nasceria sem skills)
 *   G2 — templates abaixo de MAX_LINKS_PER_TEMPLATE
 *   G3 — templates sem nenhum "strong match"
 *   G4 — skills órfãs (nunca recomendadas para nenhum template)
 *   G5 — não-determinismo (duas execuções divergem)
 *   G6 — vínculos duplicados dentro do mesmo template
 *
 * Uso:
 *   psql -At -c "select json_agg(t) from skill_registry t" | bun scripts/template-link-coverage.ts
 *   ... | bun scripts/template-link-coverage.ts --emit-sql > /tmp/links.sql
 */
import { AGENT_TEMPLATES } from '../src/data/agentTemplates';
import { linkSkillsToTemplate } from '../src/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '../src/services/skillsRegistryService';

const MAX_LINKS_PER_TEMPLATE = 6;

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const raw = (await readStdin()).trim();
if (!raw) {
  console.error('Nenhum catálogo recebido no stdin.');
  process.exit(1);
}

const skills = JSON.parse(raw) as AgentSkillDefinition[];
const emitSql = process.argv.includes('--emit-sql');

interface Row {
  templateId: string;
  skillId: string;
  score: number;
  reason: string;
  strong: boolean;
  department: boolean;
  keywords: string[];
}

function run(): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const template of AGENT_TEMPLATES) {
    const linked = linkSkillsToTemplate(template, skills, MAX_LINKS_PER_TEMPLATE);
    out.set(
      template.id,
      linked.map((l) => ({
        templateId: template.id,
        skillId: l.skill.id,
        score: Number(l.score.toFixed(3)),
        reason: l.reason ?? '',
        strong: Boolean(l.isStrongMatch),
        department: Boolean(l.breakdown?.department),
        keywords: l.matchedKeywords ?? [],
      })),
    );
  }
  return out;
}

const first = run();
const second = run();

const gaps: string[] = [];
const seenSkills = new Set<string>();

for (const [templateId, rows] of first) {
  const ids = rows.map((r) => r.skillId);
  ids.forEach((id) => seenSkills.add(id));

  if (rows.length === 0) gaps.push(`G1 sem vínculos: ${templateId}`);
  else if (rows.length < MAX_LINKS_PER_TEMPLATE)
    gaps.push(`G2 parcial (${rows.length}/${MAX_LINKS_PER_TEMPLATE}): ${templateId}`);
  if (rows.length > 0 && !rows.some((r) => r.strong)) gaps.push(`G3 sem strong match: ${templateId}`);
  if (new Set(ids).size !== ids.length) gaps.push(`G6 duplicatas: ${templateId}`);

  const sig = JSON.stringify(rows);
  if (sig !== JSON.stringify(second.get(templateId))) gaps.push(`G5 não-determinístico: ${templateId}`);
}

const orphans = skills.filter((s) => !seenSkills.has(s.id));

if (emitSql) {
  const values: string[] = [];
  for (const rows of first.values()) {
    for (const r of rows) {
      values.push(
        `(${sqlLiteral(r.templateId)}, ${sqlLiteral(r.skillId)}::uuid, ${r.score}, ${sqlLiteral(
          r.reason,
        )}, ${r.strong}, ${r.department}, ARRAY[${r.keywords.map(sqlLiteral).join(',') || ''}]::text[], 'auto')`,
      );
    }
  }
  console.log('BEGIN;');
  console.log(
    'INSERT INTO public.template_skill_links (template_id, skill_id, score, reason, is_strong_match, department_match, matched_keywords, origin) VALUES',
  );
  console.log(values.join(',\n'));
  console.log(`ON CONFLICT (template_id, skill_id) DO UPDATE SET
  score = EXCLUDED.score,
  reason = EXCLUDED.reason,
  is_strong_match = EXCLUDED.is_strong_match,
  department_match = EXCLUDED.department_match,
  matched_keywords = EXCLUDED.matched_keywords,
  deleted_at = CASE WHEN public.template_skill_links.origin = 'manual' THEN public.template_skill_links.deleted_at ELSE NULL END,
  deleted_by = CASE WHEN public.template_skill_links.origin = 'manual' THEN public.template_skill_links.deleted_by ELSE NULL END,
  updated_at = now()
WHERE public.template_skill_links.origin = 'auto';`);
  console.log('COMMIT;');
} else {
  const total = [...first.values()].reduce((acc, r) => acc + r.length, 0);
  console.log(`Templates simulados: ${AGENT_TEMPLATES.length}`);
  console.log(`Skills no catálogo: ${skills.length}`);
  console.log(`Vínculos gerados: ${total}`);
  console.log(`Skills utilizadas: ${seenSkills.size} | órfãs: ${orphans.length}`);
  console.log(`Gaps: ${gaps.length}`);
  for (const g of gaps.slice(0, 40)) console.log('  - ' + g);
  if (orphans.length) {
    console.log('Órfãs (amostra):');
    for (const o of orphans.slice(0, 15)) console.log(`  · ${o.slug} [${o.department ?? 'sem depto'}]`);
  }
}
