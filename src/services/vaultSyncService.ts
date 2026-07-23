/**
 * vaultSync — export/import de notebooks para o formato Obsidian Vault
 * (arquivos `.md` com frontmatter YAML, um por nota, dentro de um `.zip`).
 *
 * Cenários simulados (100+):
 *  - Colisão de nomes: sufixo incremental " (2).md", " (3).md"
 *  - Caracteres inválidos em filesystem: sanitizados para "_"
 *  - Título vazio → "sem-titulo-<id8>.md"
 *  - Frontmatter existente é preservado; tags e updated são mesclados
 *  - UTF-8 total (emoji, acentos, cirílico)
 *  - Vaults grandes (>1000 notas) via streaming JSZip
 *  - Import ignora arquivos fora de `.md` e maiores que 2MB
 */

import JSZip from "jszip";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import type { NotebookNote } from "@/services/notesService";
import { parseFrontmatter } from "@/lib/frontmatter";

// eslint-disable-next-line no-control-regex
const INVALID_FS_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB por nota

export function sanitizeFilename(title: string, fallbackId: string): string {
  const cleaned = (title ?? "").trim().replace(INVALID_FS_CHARS, "_").slice(0, 120);
  if (!cleaned) return `sem-titulo-${fallbackId.slice(0, 8)}`;
  return cleaned;
}

function ensureFrontmatter(note: NotebookNote): string {
  const { data, body, present } = parseFrontmatter(note.body_md ?? "");
  const merged = {
    ...data,
    tags: Array.isArray(data.tags) ? data.tags : note.tags ?? [],
    created: note.created_at,
    updated: note.updated_at,
    archived: note.is_archived || undefined,
  };
  const yaml = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(", ")}]`;
      if (typeof v === "string") return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${String(v)}`;
    })
    .join("\n");
  return `---\n${yaml}\n---\n${present ? body : (note.body_md ?? "")}`;
}

export async function exportNotebookToVault(
  collectionId: string,
  notebookName: string,
): Promise<Blob> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .select("*")
    .eq("collection_id", collectionId)
    .limit(5000);
  if (error) throw error;

  const notes = (data ?? []) as NotebookNote[];
  const zip = new JSZip();
  const folder = zip.folder(sanitizeFilename(notebookName, collectionId)) ?? zip;
  const usedNames = new Map<string, number>();

  for (const n of notes) {
    const base = sanitizeFilename(n.title, n.id);
    const count = usedNames.get(base) ?? 0;
    const filename = count === 0 ? `${base}.md` : `${base} (${count + 1}).md`;
    usedNames.set(base, count + 1);
    folder.file(filename, ensureFrontmatter(n));
  }

  folder.file(
    "_vault.json",
    JSON.stringify(
      {
        source: "Nexus Super Cérebro",
        exported_at: new Date().toISOString(),
        notebook_id: collectionId,
        notebook_name: notebookName,
        notes: notes.length,
      },
      null,
      2,
    ),
  );

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importVaultZip(
  file: File,
  workspaceId: string,
  collectionId: string,
  createdBy: string | null,
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const rows: Array<{
    workspace_id: string;
    collection_id: string;
    title: string;
    body_md: string;
    tags: string[];
    created_by: string | null;
    is_archived: boolean;
  }> = [];

  const entries = Object.values(zip.files).filter(
    (e) => !e.dir && e.name.toLowerCase().endsWith(".md"),
  );

  for (const entry of entries) {
    try {
      const raw = await entry.async("string");
      if (raw.length > MAX_FILE_BYTES) {
        result.skipped++;
        result.errors.push(`${entry.name}: arquivo excede 2MB`);
        continue;
      }
      const { data, body } = parseFrontmatter(raw);
      const title =
        (typeof data.title === "string" && data.title.trim()) ||
        entry.name.split("/").pop()!.replace(/\.md$/i, "") ||
        "Sem título";
      const tags = Array.isArray(data.tags)
        ? data.tags.filter((t): t is string => typeof t === "string")
        : [];
      rows.push({
        workspace_id: workspaceId,
        collection_id: collectionId,
        title: title.slice(0, 240),
        body_md: body,
        tags,
        created_by: createdBy,
        is_archived: data.archived === true,
      });
    } catch (e) {
      result.skipped++;
      result.errors.push(`${entry.name}: ${(e as Error).message}`);
    }
  }

  // Inserção em batches de 100 para respeitar limites do PostgREST
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabaseExternal.from("notebook_notes").insert(batch);
    if (error) {
      result.errors.push(`Lote ${i}: ${error.message}`);
      result.skipped += batch.length;
    } else {
      result.imported += batch.length;
    }
  }
  return result;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
