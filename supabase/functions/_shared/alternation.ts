/**
 * repairAlternation — normaliza um histórico [{role,content}] para os
 * requisitos dos provedores LLM (Anthropic/OpenAI/Gemini):
 *
 * 1. Colapsa turnos consecutivos do mesmo role em uma única mensagem,
 *    concatenando com `\n---\n` para preservar a fronteira original.
 *    Corrige o padrão comum do WhatsApp: [user, user, user] → [user].
 * 2. Descarta mensagens vazias (após trim).
 * 3. Garante que o primeiro turno seja `user` — remove leading assistants
 *    (que ocorrem se o histórico começa com uma resposta órfã).
 * 4. Nunca termina com `assistant` quando `endWithUser=true` (padrão):
 *    remove o último assistant se ele ficou solto.
 *
 * Inspirado em `repair_alternation` do hermes-agent (NousResearch), adaptado
 * para o gateway do Fator X.
 */

export type ChatRole = 'user' | 'assistant' | 'system';
export interface ChatTurn { role: ChatRole; content: string }

export interface RepairOptions {
  endWithUser?: boolean;      // default: true
  joinSeparator?: string;     // default: '\n---\n'
  keepSystem?: boolean;       // default: true (system messages ficam intactos e sempre no topo)
}

export function repairAlternation(input: ChatTurn[], opts: RepairOptions = {}): ChatTurn[] {
  const { endWithUser = true, joinSeparator = '\n---\n', keepSystem = true } = opts;

  // 1. Filtra vazios + separa system
  const systems: ChatTurn[] = [];
  const rest: ChatTurn[] = [];
  for (const turn of input) {
    if (!turn || typeof turn.content !== 'string') continue;
    const content = turn.content.trim();
    if (!content) continue;
    if (turn.role === 'system') {
      if (keepSystem) systems.push({ role: 'system', content });
      continue;
    }
    if (turn.role !== 'user' && turn.role !== 'assistant') continue;
    rest.push({ role: turn.role, content });
  }

  // 2. Colapsa runs consecutivos do mesmo role
  const collapsed: ChatTurn[] = [];
  for (const turn of rest) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}${joinSeparator}${turn.content}`;
    } else {
      collapsed.push({ ...turn });
    }
  }

  // 3. Remove leading assistants
  while (collapsed.length > 0 && collapsed[0].role === 'assistant') {
    collapsed.shift();
  }

  // 4. Termina com user quando exigido
  if (endWithUser) {
    while (collapsed.length > 0 && collapsed[collapsed.length - 1].role === 'assistant') {
      collapsed.pop();
    }
  }

  return keepSystem ? [...systems, ...collapsed] : collapsed;
}
