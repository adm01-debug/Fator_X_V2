/**
 * Registro central de comandos da paleta ⌘P do Super Cérebro.
 * Cada comando é serializável e resolvido no host via `run`.
 */
import type { LucideIcon } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  group: "Navegação" | "Notas" | "IA" | "Notebook" | "Geral";
  shortcut?: string;
  keywords?: string;
  icon?: LucideIcon;
  run: () => void | Promise<void>;
}
