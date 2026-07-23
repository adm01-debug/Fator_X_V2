/**
 * shareService — publica snapshots read-only de notas via URL codificada no
 * fragmento (`#…`). Zero backend, zero RLS: o payload viaja no hash e nunca
 * chega ao servidor. Usa CompressionStream (gzip) quando disponível, com
 * fallback para base64 puro.
 */
export interface NoteSnapshot {
  v: 1;
  title: string;
  body_md: string;
  tags: string[];
  publishedAt: string;
}

const MAX_BODY_CHARS = 200_000; // limite defensivo (URLs muito longas quebram em alguns browsers)

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const CS = (globalThis as unknown as { CompressionStream?: typeof CompressionStream }).CompressionStream;
  if (!CS) return bytes;
  const stream = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CS("gzip")));
  return new Uint8Array(await stream.arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) return bytes;
  const stream = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DS("gzip")));
  return new Uint8Array(await stream.arrayBuffer());
}

export async function encodeSnapshot(snap: NoteSnapshot): Promise<string> {
  const safe: NoteSnapshot = {
    ...snap,
    body_md: snap.body_md.slice(0, MAX_BODY_CHARS),
    tags: snap.tags.slice(0, 50),
  };
  const json = new TextEncoder().encode(JSON.stringify(safe));
  const gz = await gzip(json);
  // prefixo "g" indica gzip, "r" raw — para forward-compat
  const useGz = gz.length < json.length;
  const payload = useGz ? gz : json;
  return (useGz ? "g" : "r") + toBase64Url(payload);
}

export async function decodeSnapshot(encoded: string): Promise<NoteSnapshot | null> {
  try {
    if (!encoded || encoded.length < 2) return null;
    const flag = encoded[0];
    const body = encoded.slice(1);
    const bytes = fromBase64Url(body);
    const raw = flag === "g" ? await gunzip(bytes) : bytes;
    const json = new TextDecoder().decode(raw);
    const parsed = JSON.parse(json) as NoteSnapshot;
    if (parsed?.v !== 1 || typeof parsed.title !== "string" || typeof parsed.body_md !== "string") {
      return null;
    }
    return {
      v: 1,
      title: String(parsed.title).slice(0, 500),
      body_md: String(parsed.body_md).slice(0, MAX_BODY_CHARS),
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string").slice(0, 50) : [],
      publishedAt: typeof parsed.publishedAt === "string" ? parsed.publishedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function buildShareUrl(snap: NoteSnapshot): Promise<string> {
  const encoded = await encodeSnapshot(snap);
  return `${window.location.origin}/share/n#${encoded}`;
}
