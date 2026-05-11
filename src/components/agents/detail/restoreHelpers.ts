/**
 * Resumo curto e legível das opções de um rollback/undo, incluindo overrides técnicos.
 */
export function summarizeRestoreOptions(
  opts: {
    copyPrompt: boolean;
    copyTools: boolean;
    copyModel: boolean;
  },
  overrides?: {
    config?: Partial<{ temperature: number | null; max_tokens: number | null; reasoning: string | null; tools: unknown[] | null }>;
    model?: string | null;
  }
): string {
  const parts: string[] = [];
  if (opts.copyPrompt) parts.push("prompt");
  if (opts.copyTools) parts.push("ferramentas");
  if (opts.copyModel) parts.push("modelo e parâmetros");
  
  let base = parts.length === 0 ? "nenhum campo restaurado"
    : parts.length === 1 ? `restaurou ${parts[0]}`
    : parts.length === 2 ? `restaurou ${parts[0]} e ${parts[1]}`
    : `restaurou ${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;

  const ovParts: string[] = [];
  if (overrides?.model) ovParts.push(`modelo alterado para ${overrides.model}`);
  
  const cfg = overrides?.config ?? {};
  if (cfg.temperature !== undefined) ovParts.push(`temperature ${cfg.temperature}`);
  if (cfg.max_tokens !== undefined) ovParts.push(`max_tokens ${cfg.max_tokens}`);
  if (cfg.reasoning === null) ovParts.push("reasoning removido");
  else if (cfg.reasoning) ovParts.push(`reasoning ${cfg.reasoning}`);
  
  if (ovParts.length > 0) {
    base += ` (com ${ovParts.join(", ")})`;
  }

  return base;
}

