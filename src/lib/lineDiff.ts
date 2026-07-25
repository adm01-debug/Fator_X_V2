/**
 * lineDiff — LCS-based line diff shared entre painéis (versionamento, E2EE, etc).
 * O(n·m) — adequado para textos até alguns milhares de linhas.
 */
export interface DiffLine {
  kind: "added" | "removed" | "same";
  text: string;
  /** Índices 1-based na origem/alvo, quando aplicáveis. */
  aLine?: number;
  bLine?: number;
}

export function computeLineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i], aLine: i + 1, bLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: a[i], aLine: i + 1 });
      i++;
    } else {
      out.push({ kind: "added", text: b[j], bLine: j + 1 });
      j++;
    }
  }
  while (i < n) { out.push({ kind: "removed", text: a[i], aLine: i + 1 }); i++; }
  while (j < m) { out.push({ kind: "added", text: b[j], bLine: j + 1 }); j++; }
  return out;
}

/** Estatísticas rápidas: quantas linhas adicionadas/removidas/iguais. */
export function diffStats(diff: DiffLine[]): { added: number; removed: number; same: number } {
  let added = 0, removed = 0, same = 0;
  for (const d of diff) {
    if (d.kind === "added") added++;
    else if (d.kind === "removed") removed++;
    else same++;
  }
  return { added, removed, same };
}

/**
 * Merge textual simples de duas versões concorrentes:
 * concatena local + separador + incoming, evitando perda de conteúdo.
 * Não faz merge de 3 vias — é uma rede de segurança para o usuário revisar.
 */
export function naiveThreeWayMerge(local: string, incoming: string): string {
  if (local.trim() === incoming.trim()) return local;
  return [
    local.trimEnd(),
    "",
    "<!-- ⚠️ Conflito de sync — versão recebida abaixo -->",
    "",
    incoming.trimStart(),
  ].join("\n");
}
