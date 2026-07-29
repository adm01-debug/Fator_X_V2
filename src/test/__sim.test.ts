import { describe, it } from 'vitest';
import { summarizeEfficacy, type ClassificationDecision } from '@/lib/skills/classificationEfficacy';

function mk(i: number, plat: boolean, verdict: 'confirmado'|'corrigido', conf: number): ClassificationDecision {
  return {
    auditId: `a${i}`, reviewId: `r${i}`, skillId: `s${i}`, slug: `s${i}`,
    approved: verdict === 'corrigido',
    from: 'ti' as never, to: 'vendas' as never,
    confidence: conf, margin: 0.1, origin: 'lexico',
    previousSource: (plat ? 'platform_heuristic' : 'heuristic') as never,
    previousConfidence: conf, registryTouched: true,
    verdict, decidedAt: new Date(1700000000000 + i * 1000).toISOString(),
    decidedAtMs: 1700000000000 + i * 1000, reason: '',
  };
}

function rng(seed: number) { let s = seed>>>0; return () => (s = (s*1664525+1013904223)>>>0) / 0x100000000; }

describe('sim', () => {
  it('contaminacao', () => {
    const r = rng(42);
    let piores = 0, casos = 0, maxDelta = 0;
    for (let t = 0; t < 300; t++) {
      const nDom = 3 + Math.floor(r() * 20);
      const nPlat = Math.floor(r() * 20);
      const ds: ClassificationDecision[] = [];
      const domConf: number[] = [];
      for (let i = 0; i < nDom; i++) { const c = 0.5 + r()*0.45; domConf.push(c); ds.push(mk(i, false, 'confirmado', c)); }
      for (let i = 0; i < nPlat; i++) ds.push(mk(1000+i, true, 'confirmado', 0.15 + r()*0.25));
      const s = summarizeEfficacy(ds);
      const puro = domConf.reduce((a,b)=>a+b,0)/domConf.length;
      if (s.suggestedThreshold !== null && nPlat > 0) {
        casos++;
        const delta = puro - s.suggestedThreshold;
        if (delta > 0.02) piores++;
        maxDelta = Math.max(maxDelta, delta);
      }
    }
    console.log({ casos, piores, maxDelta: maxDelta.toFixed(3) });
  });
});
