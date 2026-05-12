import type { OracleResult } from '@/stores/oracleStore';

// ═══ MARKDOWN EXPORT ═══

export function exportToMarkdown(
  query: string,
  results: OracleResult,
  presetName: string,
  mode: string,
  chairmanModel: string,
): string {
  const lines: string[] = [];
  const date = new Date().toLocaleString('pt-BR');

  lines.push(`# 🔮 Resultado do Oráculo`);
  lines.push(`> ${date}\n`);
  lines.push(`## Configuração`);
  lines.push(`| Campo | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| Modo | ${mode} |`);
  lines.push(`| Preset | ${presetName} |`);
  lines.push(`| Chairman | ${chairmanModel} |`);
  lines.push(`| Modelos | ${results.metrics.models_used} |`);
  lines.push(`| Confiança | ${results.confidence_score}% |`);
  lines.push(`| Consenso | ${results.consensus_degree}% |`);
  lines.push(``);

  lines.push(`## Pergunta`);
  lines.push(`${query}\n`);

  lines.push(`## Resposta Sintetizada`);
  lines.push(`${results.final_response}\n`);

  if (results.stage1_results?.length) {
    lines.push(`## Respostas Individuais`);
    results.stage1_results.forEach((r, i) => {
      lines.push(`### ${i + 1}. ${r.model} — ${r.persona}`);
      if (r.thinking) {
        lines.push(`<details><summary>💭 Raciocínio</summary>\n\n${r.thinking}\n</details>\n`);
      }
      lines.push(`${r.content}\n`);
      lines.push(`- Tokens: ${r.tokens.total.toLocaleString()} | Custo: $${r.cost_usd.toFixed(4)} | Latência: ${(r.latency_ms / 1000).toFixed(1)}s\n`);
    });
  }

  if (results.consensus_points?.length) {
    lines.push(`## Mapa de Consenso`);
    const models = [...new Set(results.consensus_points.flatMap(p => p.modelPositions?.map(mp => mp.model) || []))];
    if (models.length > 0) {
      const shortName = (m: string) => m.split('/').pop() || m;
      lines.push(`| Ponto | ${models.map(shortName).join(' | ')} | Status |`);
      lines.push(`|---|${models.map(() => '---|').join('')}---|`);
      results.consensus_points.forEach(p => {
        const posIcon: Record<string, string> = { agree: '✅', disagree: '❌', partially_agree: '⚠️', not_mentioned: '—' };
        const levelIcon: Record<string, string> = { strong: '🟢', partial: '🟡', disputed: '🔴', unique: '🔵' };
        const positions = models.map(m => {
          const pos = p.modelPositions?.find(mp => mp.model === m);
          return posIcon[pos?.position || 'not_mentioned'];
        });
        lines.push(`| ${p.claim} | ${positions.join(' | ')} | ${levelIcon[p.consensusLevel] || '—'} |`);
      });
    } else {
       results.consensus_points.forEach(p => {
         lines.push(`- **${p.claim}**: ${p.consensusLevel}`);
       });
    }
    lines.push(``);
  }

  lines.push(`## Métricas`);
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---|---|`);
  lines.push(`| Tokens totais | ${results.metrics.total_tokens.toLocaleString()} |`);
  lines.push(`| Custo total | $${results.metrics.total_cost_usd.toFixed(4)} |`);
  lines.push(`| Tempo total | ${(results.metrics.total_latency_ms / 1000).toFixed(1)}s |`);

  return lines.join('\n');
}

export function exportToJson(
  query: string,
  results: OracleResult,
  presetName: string,
  mode: string,
  chairmanModel: string,
) {
  return JSON.stringify({
    metadata: {
      exported_at: new Date().toISOString(),
      mode,
      preset: presetName,
      chairman: chairmanModel,
    },
    query,
    results
  }, null, 2);
}

// ═══ DOWNLOAD HELPERS ═══

export function downloadText(content: string, filename: string, mime = 'text/markdown') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
