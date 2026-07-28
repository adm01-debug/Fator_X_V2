import { describe, it } from 'vitest';
import { runSkillsSimulation } from '@/services/skillsSimulationService';
describe('sim', () => { it('roda', () => {
  const r = runSkillsSimulation();
  console.log('TOTAL', r.total, 'PASS', r.passed, 'GAPS', r.failed);
  console.log('SUITES', JSON.stringify(r.suites));
  for (const g of r.gaps) console.log('GAP', g.gapKey, g.suite, 'x' + g.occurrences, '|', g.sample.name, '| esperado:', g.sample.expected, '| obtido:', g.sample.actual);
}); });
