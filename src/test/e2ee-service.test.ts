/**
 * e2eeService — testes unitários da Wave M.
 * Cobre round-trip encrypt/decrypt (AES-GCM + PBKDF2) e planReconciliation.
 */
import { describe, it, expect } from "vitest";
import {
  encryptBundle,
  decryptBundle,
  planReconciliation,
  E2EE_BUNDLE_VERSION,
  type BundlePayload,
} from "@/services/e2eeService";

const NB_ID = "11111111-1111-1111-1111-111111111111";

function samplePayload(): BundlePayload {
  return {
    notebook_id: NB_ID,
    exported_at: "2026-07-23T12:00:00.000Z",
    notes: [
      {
        id: "n1",
        title: "Nota 1",
        body_md: "# Olá\n\nAção, conexão e ✨ emojis.",
        tags: ["a", "b"],
        updated_at: "2026-07-23T11:00:00.000Z",
        is_archived: false,
      },
      {
        id: "n2",
        title: "Segunda",
        body_md: "conteúdo",
        tags: [],
        updated_at: "2026-07-23T11:05:00.000Z",
        is_archived: false,
      },
    ],
  };
}

describe("e2eeService — encrypt/decrypt round-trip", () => {
  it("cifra e decifra preservando o payload", async () => {
    const payload = samplePayload();
    const bundle = await encryptBundle(payload, "senha-super-segura");

    expect(bundle.version).toBe(E2EE_BUNDLE_VERSION);
    expect(bundle.notebook_id).toBe(NB_ID);
    expect(bundle.cipher.algo).toBe("AES-GCM");
    expect(bundle.kdf.algo).toBe("PBKDF2-SHA256");
    // O ciphertext não pode conter texto pleno
    expect(bundle.cipher.data_b64).not.toContain("Olá");

    const back = await decryptBundle(bundle, "senha-super-segura");
    expect(back).toEqual(payload);
  });

  it("cada cifragem produz IV/salt distintos", async () => {
    const p = samplePayload();
    const b1 = await encryptBundle(p, "senha-super-segura");
    const b2 = await encryptBundle(p, "senha-super-segura");
    expect(b1.cipher.iv_b64).not.toBe(b2.cipher.iv_b64);
    expect(b1.kdf.salt_b64).not.toBe(b2.kdf.salt_b64);
    expect(b1.cipher.data_b64).not.toBe(b2.cipher.data_b64);
  });

  it("rejeita passphrase curta", async () => {
    await expect(encryptBundle(samplePayload(), "curta")).rejects.toThrow();
  });

  it("falha ao decifrar com passphrase incorreta", async () => {
    const bundle = await encryptBundle(samplePayload(), "senha-super-segura");
    await expect(decryptBundle(bundle, "senha-errada!")).rejects.toThrow(/decifrar/i);
  });

  it("falha em bundle com versão desconhecida", async () => {
    const bundle = await encryptBundle(samplePayload(), "senha-super-segura");
    await expect(decryptBundle({ ...bundle, version: 999 }, "senha-super-segura")).rejects.toThrow(/versão/i);
  });
});

describe("e2eeService — planReconciliation", () => {
  const base = (id: string, updated: string, title = "T") => ({
    id,
    title,
    body_md: "",
    tags: [] as string[],
    updated_at: updated,
    is_archived: false,
  });

  it("classifica insert / update / keep corretamente", () => {
    const incoming: BundlePayload = {
      notebook_id: NB_ID,
      exported_at: "2026-07-23T12:00:00Z",
      notes: [
        base("novo", "2026-07-23T10:00:00Z"),           // insert
        base("mais-novo", "2026-07-23T12:00:00Z"),       // update (incoming vence)
        base("mais-antigo", "2026-07-23T08:00:00Z"),     // keep (local vence)
      ],
    };
    const local = [
      base("mais-novo", "2026-07-23T10:00:00Z"),
      base("mais-antigo", "2026-07-23T12:00:00Z"),
    ];

    const plan = planReconciliation(incoming, local);
    expect(plan.toInsert.map((n) => n.id)).toEqual(["novo"]);
    expect(plan.toUpdate.map((n) => n.id)).toEqual(["mais-novo"]);
    expect(plan.toKeep).toEqual(["mais-antigo"]);
    expect(plan.conflicts).toHaveLength(0);
  });

  it("detecta conflito quando ambos mudaram dentro da janela", () => {
    const incoming: BundlePayload = {
      notebook_id: NB_ID,
      exported_at: "2026-07-23T12:00:00Z",
      notes: [base("x", "2026-07-23T12:00:10Z", "incoming")],
    };
    const local = [base("x", "2026-07-23T12:00:20Z", "local")];
    const plan = planReconciliation(incoming, local, 60_000);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toMatchObject({
      id: "x",
      title_local: "local",
      title_incoming: "incoming",
    });
  });

  it("mantém local quando updated_at é inválido em ambos", () => {
    const incoming: BundlePayload = {
      notebook_id: NB_ID,
      exported_at: "2026-07-23T12:00:00Z",
      notes: [base("y", "invalid")],
    };
    const local = [base("y", "also-invalid")];
    const plan = planReconciliation(incoming, local);
    expect(plan.toKeep).toEqual(["y"]);
    expect(plan.conflicts).toHaveLength(0);
  });
});
