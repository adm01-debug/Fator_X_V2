/**
 * Utilitários de acessibilidade compartilhados.
 *
 * `handleKeyboardClick` transforma um elemento não-nativo em botão acionável
 * por teclado (Enter e Espaço), preservando a semântica esperada pela WCAG 2.1.
 */
import type { KeyboardEvent } from "react";

/**
 * Handler `onKeyDown` que dispara o clique quando o usuário pressiona
 * Enter ou Espaço. Combine sempre com `role="button"` e `tabIndex={0}`.
 *
 * @example
 * <div
 *   role="button"
 *   tabIndex={0}
 *   onClick={handleAction}
 *   onKeyDown={handleKeyboardClick}
 * />
 */
export function handleKeyboardClick<T extends HTMLElement = HTMLElement>(
  e: KeyboardEvent<T>,
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
}
