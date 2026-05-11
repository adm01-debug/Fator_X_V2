/**
 * Resumo curto e legível das opções de um rollback/undo.
 *
 * Ex.: { copyPrompt:true, copyTools:true } → "restaurou prompt e ferramentas"
 *      { copyModel:true }                  → "restaurou modelo e parâmetros"
 *      todas false                          → "nenhum campo restaurado"
 *      todas true                           → "restaurou prompt, ferramentas e modelo"
 *
 * Usado tanto no toast de sucesso do undo quanto na timeline de restaurações,
 * para que o usuário veja em uma linha o que de fato mudou — sem precisar
 * decodificar os badges individuais.
 */
export function summarizeRestoreOptions(opts: {
  copyPrompt: boolean;
  copyTools: boolean;
  copyModel: boolean;
}): string {
  const parts: string[] = [];
  if (opts.copyPrompt) parts.push("prompt");
  if (opts.copyTools) parts.push("ferramentas");
  if (opts.copyModel) parts.push("modelo e parâmetros");
  
  if (parts.length === 0) return "nenhum campo restaurado";
  if (parts.length === 1) return `restaurou ${parts[0]}`;
  if (parts.length === 2) return `restaurou ${parts[0]} e ${parts[1]}`;
  
  return `restaurou ${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
