/**
 * ════════════════════════════════════════════════════════════════════
 * CRM Normalizer — espelhamento Bitrix24 → modelo canônico crm_*
 * ════════════════════════════════════════════════════════════════════
 *
 * Por que existe: o webhook do Bitrix24 grava apenas um audit log opaco
 * (`bitrix24_webhook_events.raw_payload`). Sem normalização não há como
 * pontuar, cadenciar ou prever nada sem round-trip ao Bitrix a cada leitura.
 *
 * Limite conhecido e deliberado: o payload de webhook do Bitrix24 costuma
 * trazer APENAS `data[FIELDS][ID]`. Portanto o upsert aqui cria/atualiza um
 * registro "casca" idempotente por `external_ref`, marcado com
 * `enrichment_json.sync_state = 'pending'`. A hidratação completa é feita
 * pela função `crm-bitrix-sync`, que consulta a REST API. Inventar campos a
 * partir de um payload que não os contém seria pior do que admitir o vazio.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type CrmEntityKind = "deal" | "contact" | "company" | "lead";

/** Mapeia o evento do Bitrix24 para a entidade canônica correspondente. */
export function entityKindForEvent(eventType: string): CrmEntityKind | null {
  const normalized = eventType.toUpperCase();
  if (normalized.startsWith("ONCRMDEAL")) return "deal";
  if (normalized.startsWith("ONCRMCONTACT")) return "contact";
  if (normalized.startsWith("ONCRMCOMPANY")) return "company";
  if (normalized.startsWith("ONCRMLEAD")) return "lead";
  return null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Extrai o primeiro valor de campos multi-valor do Bitrix
 * (EMAIL/PHONE chegam como `[{ VALUE, VALUE_TYPE }]`).
 */
function firstMultiValue(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) {
    const head = value[0] as Record<string, unknown> | string;
    if (typeof head === "string") return str(head);
    return str(head?.VALUE);
  }
  return str(value);
}

export interface NormalizeResult {
  kind: CrmEntityKind;
  table: string;
  externalRef: string;
  action: "inserted" | "updated" | "skipped";
}

/**
 * Faz upsert idempotente do registro no modelo canônico.
 *
 * Idempotência: a chave é (`workspace_id`, `external_ref`) — o mesmo índice
 * único que existe na migração. Reentregas do Bitrix24 (que são comuns, pois
 * ele reenvia em caso de timeout) convergem para o mesmo registro em vez de
 * duplicarem o funil.
 */
export async function upsertFromBitrix(
  client: SupabaseClient,
  params: {
    workspaceId: string;
    eventType: string;
    fields: Record<string, unknown>;
    traceId?: string;
    /** true quando os dados vieram da REST API (hidratação completa). */
    hydrated?: boolean;
  },
): Promise<NormalizeResult | null> {
  const kind = entityKindForEvent(params.eventType);
  if (!kind) return null;

  const externalRef = str(params.fields.ID);
  if (!externalRef) return null;

  const syncState = params.hydrated ? "synced" : "pending";
  const base = {
    workspace_id: params.workspaceId,
    external_ref: `${kind}:${externalRef}`,
  };

  if (kind === "company") {
    const row = {
      ...base,
      name: str(params.fields.TITLE) ?? `Empresa Bitrix ${externalRef}`,
      domain: firstMultiValue(params.fields.WEB),
      industry: str(params.fields.INDUSTRY),
      enrichment_json: { source: "bitrix24", sync_state: syncState },
    };
    const { error } = await client
      .from("crm_companies")
      .upsert(row, { onConflict: "workspace_id,external_ref" });
    if (error) throw new Error(`crm_companies upsert: ${error.message}`);
    return { kind, table: "crm_companies", externalRef, action: "updated" };
  }

  if (kind === "contact" || kind === "lead") {
    const name =
      [str(params.fields.NAME), str(params.fields.LAST_NAME)].filter(Boolean).join(" ") ||
      str(params.fields.TITLE) ||
      `Contato Bitrix ${externalRef}`;
    const row = {
      ...base,
      full_name: name,
      email: firstMultiValue(params.fields.EMAIL),
      phone: firstMultiValue(params.fields.PHONE),
      job_title: str(params.fields.POST),
      enrichment_json: {
        source: "bitrix24",
        sync_state: syncState,
        bitrix_kind: kind,
      },
    };
    const { error } = await client
      .from("crm_contacts")
      .upsert(row, { onConflict: "workspace_id,external_ref" });
    if (error) throw new Error(`crm_contacts upsert: ${error.message}`);
    return { kind, table: "crm_contacts", externalRef, action: "updated" };
  }

  // kind === "deal"
  const closedStage = str(params.fields.CLOSED) === "Y";
  const row = {
    ...base,
    title: str(params.fields.TITLE) ?? `Negócio Bitrix ${externalRef}`,
    amount: num(params.fields.OPPORTUNITY) ?? 0,
    currency: str(params.fields.CURRENCY_ID) ?? "BRL",
    status: closedStage ? "won" : "open",
    expected_close_at: str(params.fields.CLOSEDATE),
    last_activity_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("crm_deals")
    .upsert(row, { onConflict: "workspace_id,external_ref" });
  if (error) throw new Error(`crm_deals upsert: ${error.message}`);

  return { kind, table: "crm_deals", externalRef, action: "updated" };
}

/** Registra a origem do espelhamento na timeline unificada. */
export async function logSyncActivity(
  client: SupabaseClient,
  params: {
    workspaceId: string;
    eventType: string;
    result: NormalizeResult;
    traceId?: string;
  },
): Promise<void> {
  const { error } = await client.from("crm_activities").insert({
    workspace_id: params.workspaceId,
    activity_type: "system",
    source: "bitrix24",
    body: `Evento ${params.eventType} espelhado em ${params.result.table}`,
    metadata: {
      external_ref: params.result.externalRef,
      kind: params.result.kind,
      table: params.result.table,
    },
    trace_id: params.traceId ?? null,
  });
  if (error) console.error("crm_activities insert failed:", error.message);
}
