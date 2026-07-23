import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nexus.obsidianMode";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Persistent toggle for Obsidian Mode (skin alternativa do Super Cérebro).
 * Escopo visual é aplicado via classe `.obsidian-mode` num wrapper com
 * `data-scope="super-cerebro"`. O hook cuida apenas de estado + persistência.
 */
export function useObsidianMode() {
  const [enabled, setEnabled] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      /* storage indisponível — silencioso */
    }
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((v) => !v), []);

  return { enabled, toggle, setEnabled };
}
