/**
 * useAutoE2EESync — Assina o motor de auto-sync para um notebook e
 * expõe controles start/stop/runNow.
 */
import { useEffect, useState, useCallback } from "react";
import {
  startAutoSync,
  stopAutoSync,
  triggerAutoSyncNow,
  subscribeAutoSync,
  type AutoSyncStatus,
} from "@/services/e2eeAutoSync";

export function useAutoE2EESync(notebookId: string | null | undefined, enabled: boolean, intervalMs = 60_000) {
  const [status, setStatus] = useState<AutoSyncStatus | null>(null);

  useEffect(() => {
    if (!notebookId) {
      setStatus(null);
      return;
    }
    const unsub = subscribeAutoSync(notebookId, setStatus);
    if (enabled) {
      startAutoSync(notebookId, intervalMs);
    } else {
      stopAutoSync(notebookId);
    }
    return () => {
      unsub();
      if (notebookId) stopAutoSync(notebookId);
    };
  }, [notebookId, enabled, intervalMs]);

  const runNow = useCallback(() => {
    if (notebookId) triggerAutoSyncNow(notebookId);
  }, [notebookId]);

  return { status, runNow };
}
