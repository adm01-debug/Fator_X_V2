import type { OracleResult } from '@/stores/oracleStore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

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

// ═══ JSON EXPORT ═══

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

// ═══ PDF EXPORT ═══

export function exportToPdf(
  query: string,
  results: OracleResult,
  presetName: string,
  mode: string,
  chairmanModel: string,
) {
  const doc = new jsPDF() as any;
  const date = new Date().toLocaleString('pt-BR');

  // Header
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text('Relatorio de Auditoria - Oraculo', 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Data: ${date}`, 14, 30);
  doc.text(`Modo: ${mode} | Preset: ${presetName}`, 14, 35);

  // Stats Table
  doc.autoTable({
    startY: 45,
    head: [['Metrica', 'Valor']],
    body: [
      ['Confianca', `${results.confidence_score}%`],
      ['Consenso', `${results.consensus_degree}%`],
      ['Chairman', chairmanModel],
      ['Custo Total', `$${results.metrics.total_cost_usd.toFixed(4)}`],
      ['Tempo Total', `${(results.metrics.total_latency_ms / 1000).toFixed(1)}s`],
      ['Tokens', results.metrics.total_tokens.toLocaleString()],
    ],
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229] },
  });

  // Query section
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Pergunta:', 14, finalY);
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  const queryLines = doc.splitTextToSize(query, 180);
  doc.text(queryLines, 14, finalY + 7);

  // Synthesis section
  const synthesisY = finalY + (queryLines.length * 6) + 15;
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.text('Sintese do Presidente:', 14, synthesisY);
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const synthesisLines = doc.splitTextToSize(results.final_response, 180);
  doc.text(synthesisLines, 14, synthesisY + 7);

  // Final page for details if needed
  if (results.stage1_results?.length) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Respostas Individuais do Conselho', 14, 22);
    
    results.stage1_results.forEach((r, i) => {
      const currentY = doc.internal.pageSize.height - 30 > (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable?.finalY + 10 : 30;
      doc.autoTable({
        startY: i === 0 ? 30 : currentY,
        head: [[`Membro ${i + 1}: ${r.model}`]],
        body: [[r.content.substring(0, 500) + (r.content.length > 500 ? '...' : '')]],
        theme: 'plain',
        headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] },
      });
    });
  }

  doc.save(`oraculo_auditoria_${Date.now()}.pdf`);
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
