/**
 * Validação de magic bytes (file signature) em uploads.
 *
 * Não confie no `Content-Type` do cliente — ele pode ser forjado.
 * Sempre valide os primeiros bytes do arquivo para determinar o tipo real.
 *
 * Uso em edge functions que aceitam upload (doc-ocr, product-mockup,
 * image-analysis, kb-ingest, avatar-upload, etc).
 */

export interface DetectedFileType {
  mime: string;
  ext: string;
}

// Lista mínima de assinaturas conhecidas — expandir conforme necessidade.
const SIGNATURES: Array<{
  mime: string;
  ext: string;
  bytes: number[];
  offset?: number;
}> = [
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF + WEBP@offset 8
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/zip", ext: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  // docx/xlsx/pptx também começam com PK (zip)
  { mime: "audio/mpeg", ext: "mp3", bytes: [0x49, 0x44, 0x33] },
  { mime: "audio/wav", ext: "wav", bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: "video/mp4", ext: "mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
];

const ALLOWED_MIME_DEFAULTS = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "audio/mpeg", "audio/wav",
]);

/**
 * Detecta o MIME real de um arquivo pelos magic bytes.
 * Retorna null se nenhuma assinatura conhecida for encontrada.
 */
export function detectFileType(buffer: Uint8Array): DetectedFileType | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;
    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[offset + i] !== sig.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/**
 * Valida upload: verifica se o MIME real bate com a allowlist.
 * Lança erro descritivo em caso de mismatch — permitindo resposta 400 clara.
 */
export function assertAllowedUpload(
  buffer: Uint8Array,
  allowedMimes: Iterable<string> = ALLOWED_MIME_DEFAULTS,
  maxBytes = 25 * 1024 * 1024,
): DetectedFileType {
  if (buffer.length > maxBytes) {
    throw new Error(`Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)}MB`);
  }
  const detected = detectFileType(buffer);
  if (!detected) {
    throw new Error("Tipo de arquivo não reconhecido (assinatura inválida)");
  }
  const allowed = new Set(allowedMimes);
  if (!allowed.has(detected.mime)) {
    throw new Error(`Tipo ${detected.mime} não é permitido para este endpoint`);
  }
  return detected;
}
