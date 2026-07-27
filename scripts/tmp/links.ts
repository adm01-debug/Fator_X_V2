import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

const json = execSync(`psql -At -c "select coalesce(json_agg(row_to_json(t)),'[]') from (select id,name,slug,description,version,author,category,tags,install_count,rating,skill_config,is_verified,is_public,created_at,department,quality_score from public.skill_registry where is_public = true) t"`).toString();
const registry = JSON.parse(json) as AgentSkillDefinition[];
console.log('registry=', registry.length, 'templates=', AGENT_TEMPLATES.length);

const rows: string[] = [];
let strong = 0, weak = 0, empty = 0;
const esc = (s: string) => s.replace(/'/g, "''");
for (const t of AGENT_TEMPLATES) {
  const links = linkSkillsToTemplate(t, registry, 4);
  if (links.length === 0) { empty++; console.log('SEM VINCULO:', t.id); continue; }
  for (const l of links) {
    l.isStrongMatch ? strong++ : weak++;
    const kws = [...new Set([...l.affinities, ...l.matchedKeywords])].slice(0, 8);
    rows.push(`('${esc(t.id)}','${l.skill.id}',${l.score.toFixed(3)},'${esc(l.reason)}',${l.isStrongMatch},${l.departmentMatch},ARRAY[${kws.slice(0,3).map(k=>`'${esc(k)}'`).join(',')}]::text[],'auto')`);
  }
}
console.log({ strong, weak, empty, total: rows.length });
writeFileSync('/tmp/links.sql', `INSERT INTO public.template_skill_links (template_id,skill_id,score,reason,is_strong_match,department_match,matched_keywords,origin) VALUES\n${rows.join(',\n')}\nON CONFLICT (template_id, skill_id) DO UPDATE SET score=EXCLUDED.score, reason=EXCLUDED.reason, is_strong_match=EXCLUDED.is_strong_match, department_match=EXCLUDED.department_match, matched_keywords=EXCLUDED.matched_keywords, updated_at=now();`);
