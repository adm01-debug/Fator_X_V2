/**
 * e2eeService — Sync criptografado End-to-End por notebook.
 *
 * Modelo:
 *  - Chave derivada de uma passphrase via PBKDF2-SHA256 (250k iters, salt por bundle).
 *  - Criptografia AES-GCM 256 bits (IV aleatório de 12 bytes por bundle).
 *  - A passphrase NUNCA é persistida no servidor. Vive apenas na sessão do
 *    navegador (sessionStorage) — some ao fechar a aba.
 *  - O bundle exportado é um JSON puro que pode ser guardado em qualquer
 *    lugar (Drive, S3, USB) e importado depois com a passphrase original.
 *
 * Reconciliação:
 *  - Merge por nota (`id`) com política last-write-wins baseada em `updated_at`.
 *  - Conflitos (ambos os lados mudaram) são retornados para o usuário decidir.
 */
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import type { NotebookNote } from "@/services/notesService";
import { logger } from "@/lib/logger";

export const E2EE_BUNDLE_VERSION = 1;
const PBKDF2_ITERS = 250_000;
const SESSION_KEY_PREFIX = "nexus.e2ee.pass:";

export interface EncryptedBundle {
  version: number;
  notebook_id: string;
  exported_at: string;
  kdf: { algo: "PBKDF2-SHA256"; iters: number; salt_b64: string };
  cipher: { algo: "AES-GCM"; iv_b64: string; data_b64: string };
}

export interface BundlePayload {
  notebook_id: string;
  exported_at: string;
  notes: Array<Pick<NotebookNote, "id" | "title" | "body_md" | "tags" | "updated_at" | "is_archived">>;
}

export interface Conflict {
  id: string;
  title_local: string;
  title_incoming: string;
  updated_local: string;
  updated_incoming: string;
}

export interface ReconciliationPlan {
  toInsert: BundlePayload["notes"]; // exist só no incoming
  toUpdate: BundlePayload["notes"]; // incoming é mais novo
  toKeep: string[]; // local é mais novo
  conflicts: Conflict[]; // ambos mudaram em janelas próximas (opt-in)
}

// ─── Util base64 ────────────────────────────────────────────────────────
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ─── Passphrase (sessão) ────────────────────────────────────────────────
export function getSessionPassphrase(notebookId: string): string | null {
  try { return sessionStorage.getItem(SESSION_KEY_PREFIX + notebookId); } catch { return null; }
}
export function setSessionPassphrase(notebookId: string, pass: string): void {
  try { sessionStorage.setItem(SESSION_KEY_PREFIX + notebookId, pass); } catch { /* ignore */ }
}
export function clearSessionPassphrase(notebookId: string): void {
  try { sessionStorage.removeItem(SESSION_KEY_PREFIX + notebookId); } catch { /* ignore */ }
}

// ─── Key derivation ─────────────────────────────────────────────────────
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────────
export async function encryptBundle(payload: BundlePayload, passphrase: string): Promise<EncryptedBundle> {
  if (!passphrase || passphrase.length < 8) throw new Error("Passphrase precisa ter ao menos 8 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, plaintext);
  return {
    version: E2EE_BUNDLE_VERSION,
    notebook_id: payload.notebook_id,
    exported_at: payload.exported_at,
    kdf: { algo: "PBKDF2-SHA256", iters: PBKDF2_ITERS, salt_b64: bytesToB64(salt) },
    cipher: { algo: "AES-GCM", iv_b64: bytesToB64(iv), data_b64: bytesToB64(new Uint8Array(cipherBuf)) },
  };
}

export async function decryptBundle(bundle: EncryptedBundle, passphrase: string): Promise<BundlePayload> {
  if (bundle.version !== E2EE_BUNDLE_VERSION) throw new Error(`Versão de bundle não suportada: ${bundle.version}`);
  const salt = b64ToBytes(bundle.kdf.salt_b64);
  const iv = b64ToBytes(bundle.cipher.iv_b64);
  const data = b64ToBytes(bundle.cipher.data_b64);
  const key = await deriveKey(passphrase, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      data as unknown as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plainBuf)) as BundlePayload;
  } catch {
    throw new Error("Falha ao decifrar — passphrase incorreta ou bundle corrompido.");
  }
}

// ─── Bundle IO ──────────────────────────────────────────────────────────
export async function buildBundleFromNotebook(notebookId: string): Promise<BundlePayload> {
  const { data, error } = await supabaseExternal
    .from("notebook_notes")
    .select("id,title,body_md,tags,updated_at,is_archived")
    .eq("collection_id", notebookId);
  if (error) throw error;
  return {
    notebook_id: notebookId,
    exported_at: new Date().toISOString(),
    notes: (data ?? []) as BundlePayload["notes"],
  };
}

export function downloadBundle(bundle: EncryptedBundle, filename?: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `nexus-e2ee-${bundle.notebook_id.slice(0, 8)}-${bundle.exported_at.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readBundleFile(file: File): Promise<EncryptedBundle> {
  const text = await file.text();
  const parsed = JSON.parse(text) as EncryptedBundle;
  if (!parsed || typeof parsed !== "object" || !parsed.cipher?.data_b64) {
    throw new Error("Arquivo inválido: não é um bundle E2EE.");
  }
  return parsed;
}

// ─── Reconciliação ──────────────────────────────────────────────────────
/**
 * Diff simples last-write-wins baseado em `updated_at`.
 * `conflictWindowMs` define quando ambas as edições recentes são consideradas
 * um conflito real (default 60s).
 */
export function planReconciliation(
  incoming: BundlePayload,
  local: BundlePayload["notes"],
  conflictWindowMs = 60_000,
): ReconciliationPlan {
  const localById = new Map(local.map((n) => [n.id, n]));
  const plan: ReconciliationPlan = { toInsert: [], toUpdate: [], toKeep: [], conflicts: [] };

  for (const inc of incoming.notes) {
    const loc = localById.get(inc.id);
    if (!loc) { plan.toInsert.push(inc); continue; }
    const tLoc = Date.parse(loc.updated_at || "");
    const tInc = Date.parse(inc.updated_at || "");
    if (!Number.isFinite(tLoc) || !Number.isFinite(tInc)) { plan.toKeep.push(inc.id); continue; }
    if (tInc > tLoc + conflictWindowMs) plan.toUpdate.push(inc);
    else if (tLoc > tInc + conflictWindowMs) plan.toKeep.push(inc.id);
    else if (tInc !== tLoc) plan.conflicts.push({
      id: inc.id,
      title_local: loc.title,
      title_incoming: inc.title,
      updated_local: loc.updated_at,
      updated_incoming: inc.updated_at,
    });
    else plan.toKeep.push(inc.id);
  }
  return plan;
}

export interface ApplyOptions {
  /** IDs de conflitos que o usuário optou por sobrescrever com o incoming. */
  overwriteConflictIds?: Set<string>;
}

export async function applyReconciliation(
  incoming: BundlePayload,
  plan: ReconciliationPlan,
  workspaceId: string,
  opts: ApplyOptions = {},
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const overwrite = opts.overwriteConflictIds ?? new Set<string>();
  const inserts = plan.toInsert.map((n) => ({
    id: n.id,
    workspace_id: workspaceId,
    collection_id: incoming.notebook_id,
    title: n.title,
    body_md: n.body_md,
    tags: n.tags ?? [],
    is_archived: n.is_archived ?? false,
    updated_at: n.updated_at,
  }));
  const updates = [
    ...plan.toUpdate,
    ...plan.conflicts.filter((c) => overwrite.has(c.id)).map((c) => incoming.notes.find((n) => n.id === c.id)!).filter(Boolean),
  ];

  let inserted = 0;
  let updated = 0;

  if (inserts.length > 0) {
    const { error } = await supabaseExternal.from("notebook_notes").insert(inserts);
    if (error) { logger.error("e2ee.apply.insert_failed", { error: error.message }); throw error; }
    inserted = inserts.length;
  }
  for (const n of updates) {
    const { error } = await supabaseExternal
      .from("notebook_notes")
      .update({ title: n.title, body_md: n.body_md, tags: n.tags ?? [], is_archived: n.is_archived ?? false, updated_at: n.updated_at })
      .eq("id", n.id);
    if (error) { logger.error("e2ee.apply.update_failed", { id: n.id, error: error.message }); throw error; }
    updated += 1;
  }
  const skipped = plan.toKeep.length + plan.conflicts.filter((c) => !overwrite.has(c.id)).length;
  return { inserted, updated, skipped };
}
