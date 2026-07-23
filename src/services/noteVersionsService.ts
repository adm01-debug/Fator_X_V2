/**
 * noteVersionsService — histórico de versões de `notebook_notes`.
 * Snapshots são criados automaticamente pelo trigger `trg_note_snapshot`,
 * mas o service oferece restauração e leitura.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { updateNote, syncNoteLinks, getNote } from "@/services/notesService";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export interface NoteVersion {
  id: string;
  note_id: string;
  workspace_id: string;
  title: string;
  body_md: string;
  tags: string[];
  reason: string | null;
  version_number: number;
  created_by: string | null;
  created_at: string;
}

export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  const { data, error } = await supabaseExternal
    .from("notebook_note_versions")
    .select("*")
    .eq("note_id", noteId)
    .order("version_number", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as NoteVersion[];
}

/**
 * Restaura a nota para o estado da versão selecionada.
 * O trigger cuida de snapshotar o estado atual antes da sobrescrita,
 * então a operação é sempre reversível.
 */
export async function restoreVersion(versionId: string): Promise<void> {
  const { data: v, error } = await supabaseExternal
    .from("notebook_note_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw error;
  if (!v) throw new Error("Versão não encontrada");
  const version = v as NoteVersion;

  const updated = await updateNote(version.note_id, {
    title: version.title,
    body_md: version.body_md,
    tags: version.tags,
  });
  await syncNoteLinks(updated).catch((e) =>
    logger.warn("restore.syncLinks.failed", { error: e instanceof Error ? e.message : String(e) }),
  );

  try {
    await supabase.rpc("log_audit_entry", {
      p_action: "note.version.restored",
      p_entity_type: "note",
      p_entity_id: version.note_id,
      p_metadata: { version_number: version.version_number },
    });
  } catch {
    /* audit best-effort */
  }
}

/**
 * Diff textual simples entre a nota atual e uma versão histórica.
 * Retorna array de linhas categorizadas para renderização.
 */
export interface DiffLine {
  kind: "added" | "removed" | "same";
  text: string;
}

export async function diffAgainstCurrent(versionId: string): Promise<DiffLine[]> {
  const { data: v } = await supabaseExternal
    .from("notebook_note_versions")
    .select("note_id, body_md")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return [];
  const current = await getNote((v as { note_id: string }).note_id);
  const oldLines = ((v as { body_md: string }).body_md || "").split("\n");
  const newLines = (current?.body_md || "").split("\n");
  return computeLineDiff(oldLines, newLines);
}

/** LCS-based line diff (O(n·m) — ok para notas < 5k linhas). */
function computeLineDiff(a: string[], b: string[]): DiffLine[] {
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
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "removed", text: a[i++] });
    } else {
      out.push({ kind: "added", text: b[j++] });
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

// ─── React Query hooks ────────────────────────────────────────────────
export function useVersions(noteId: string | null) {
  return useQuery({
    queryKey: ["note-versions", noteId],
    queryFn: () => (noteId ? listVersions(noteId) : Promise.resolve([])),
    enabled: !!noteId,
    staleTime: 10_000,
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreVersion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["note"] });
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["note-versions"] });
    },
  });
}
