import { describe, it } from 'vitest';
import { runSkillsSimulation } from '@/services/skillsSimulationService';
describe('sim', () => { it('roda', () => {
  const r = runSkillsSimulation();
  console.log(JSON.stringify({ total: r.total ?? (r as any).cases?.length, passed: (r as any).passed, failed: (r as any).failed }));
  const cases = (r as any).cases ?? [];
  for (const c of cases) if (!c.passed) console.log('FAIL', c.id, c.suite, c.title, c.expectation);
}); });
