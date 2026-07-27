import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { AGENT_TEMPLATES } from '@/data/agentTemplates';
import { linkSkillsToTemplate } from '@/services/templateSkillRegistry';
import type { AgentSkillDefinition } from '@/services/skillsRegistryService';

const json = execSync(`psql -At -c "select coalesce(json_agg(row_to_json(t)),'[]') from (select id,name,slug,description,version,author,category,tags,install_count,rating,skill_config,is_verified,is_public,created_at,department,quality_score from public.skill_registry where is_public = true) t"`).toString();
const registry = JSON.parse(json) as AgentSkillDefinition[];

// ── Simulação de centenas de cenários ───────────────────────────────────────
type Sc = { nome: string; reg: AgentSkillDefinition[] };
const clone = (r: AgentSkillDefinition[]) => r.map((s) => ({ ...s, tags: [...(s.tags ?? [])] }));
const scenarios: Sc[] = [
  { nome: 'baseline', reg: registry },
  { nome: 'registry vazio', reg: [] },
  { nome: 'só coletâneas', reg: clone(registry).map((s) => ({ ...s, name: `awesome ${s.name}`, tags: ['awesome', 'list'] })) },
  { nome: 'sem departamento', reg: clone(registry).map((s) => ({ ...s, department: null })) },
  { nome: 'sem tags', reg: clone(registry).map((s) => ({ ...s, tags: [] })) },
  { nome: 'tags nulas', reg: clone(registry).map((s) => ({ ...s, tags: undefined as unknown as string[] })) },
  { nome: 'descrição vazia', reg: clone(registry).map((s) => ({ ...s, description: '' })) },
  { nome: 'departamento inválido', reg: clone(registry).map((s) => ({ ...s, department: 'xyz' })) },
  { nome: 'apenas 1 skill', reg: registry.slice(0, 1) },
  { nome: 'registry 10x', reg: Array.from({ length: 10 }, (_, i) => clone(registry).map((s) => ({ ...s, id: `${s.id.slice(0, 30)}${i}${s.id.slice(31)}` }))).flat() },
];

let falhas = 0, casos = 0;
for (const sc of scenarios) {
  const t0 = performance.now();
  let comVinculo = 0, fortes = 0, duplicados = 0, foraLimite = 0, scoreInvalido = 0;
  for (const t of AGENT_TEMPLATES) {
    casos++;
    let links;
    try {
      links = linkSkillsToTemplate(t, sc.reg, 4);
    } catch (e) {
      falhas++; console.log(`  ✗ EXCEÇÃO ${sc.nome}/${t.id}: ${(e as Error).message}`); continue;
    }
    if (links.length > 4) foraLimite++;
    if (new Set(links.map((l) => l.skill.id)).size !== links.length) duplicados++;
    if (links.some((l) => !Number.isFinite(l.score) || l.score < 0)) scoreInvalido++;
    if (links.length > 0) comVinculo++;
    fortes += links.filter((l) => l.isStrongMatch).length;
  }
  const ms = (performance.now() - t0).toFixed(0);
  const ok = duplicados === 0 && foraLimite === 0 && scoreInvalido === 0;
  if (!ok) falhas++;
  console.log(`${ok ? '✓' : '✗'} ${sc.nome.padEnd(22)} cobertura=${comVinculo}/${AGENT_TEMPLATES.length} fortes=${fortes} dup=${duplicados} limite=${foraLimite} score=${scoreInvalido} ${ms}ms`);
}
console.log(`\ncasos=${casos} falhas=${falhas}`);

// ── Geração do seed compacto ────────────────────────────────────────────────
const rows: string[] = [];
const esc = (s: string) => s.replace(/'/g, "''");
for (const t of AGENT_TEMPLATES) {
  for (const l of linkSkillsToTemplate(t, registry, 4)) {
    rows.push(`('${esc(t.id)}','${l.skill.id}',${l.score.toFixed(3)},'${esc(l.reason)}',${l.isStrongMatch},${l.departmentMatch})`);
  }
}
const half = Math.ceil(rows.length / 2);
const head = `INSERT INTO public.template_skill_links (template_id,skill_id,score,reason,is_strong_match,department_match) VALUES\n`;
const tail = `\nON CONFLICT (template_id,skill_id) DO UPDATE SET score=EXCLUDED.score, reason=EXCLUDED.reason, is_strong_match=EXCLUDED.is_strong_match, department_match=EXCLUDED.department_match, updated_at=now();`;
writeFileSync('/tmp/seed1.sql', head + rows.slice(0, half).join(',\n') + tail);
writeFileSync('/tmp/seed2.sql', head + rows.slice(half).join(',\n') + tail);
console.log('seed rows', rows.length);
