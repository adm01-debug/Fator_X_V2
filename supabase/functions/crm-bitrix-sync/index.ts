/**
 * ════════════════════════════════════════════════════════════════════
 * crm-bitrix-sync — carga inicial e reconciliação incremental
 * ════════════════════════════════════════════════════════════════════
 *
 * O webhook do Bitrix24 entrega apenas o ID da entidade, o que produz
 * registros "casca" (`enrichment_json.sync_state = 'pending'`). Esta função
 * hidrata esses registros consultando a REST API do Bitrix e também executa a
 * carga inicial do funil.
 *
 * Contratos de projeto:
 *  - Idempotente: reexecutar é seguro; a chave é (workspace_id, external_ref).
 *  - Escopado por workspace: o chamador precisa ser membro (validado no server).
 *  - Paginado: o Bitrix devolve 50 itens por página via cursor `next`.
 *  - Limitado: `maxPages` evita varredura infinita e estouro de tempo da função.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
  authenticateRequest,
  validateWorkspaceMembership,
  createAdminClient,
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitIdentifier,
  RATE_LIMITS,
  parseBody,
  z,
  withRetry,
} from '../_shared/mod.ts';
import { upsertFromBitrix } from '../_shared/crmNormalize.ts';

const SyncInput = z.object({
  workspace_id: z.string().uuid(),
  entities: z
    .array(z.enum(['deal', 'contact', 'company', 'lead']))
    .min(1)
    .max(4)
    .optional()
    .default(['company', 'contact', 'deal']),
  /** Teto de páginas por entidade (50 itens/página). */
  max_pages: z.number().int().min(1).max(40).optional().default(10),
});

/** Evento canônico equivalente, reaproveitando o normalizador do webhook. */
const EVENT_BY_ENTITY: Record<string, string> = {
  deal: 'ONCRMDEALUPDATE',
  contact: 'ONCRMCONTACTUPDATE',
  company: 'ONCRMCOMPANYUPDATE',
  lead: 'ONCRMLEADUPDATE',
};

const LIST_METHOD: Record<string, string> = {
  deal: 'crm.deal.list',
  contact: 'crm.contact.list',
  company: 'crm.company.list',
  lead: 'crm.lead.list',
};

const SELECT_FIELDS: Record<string, string[]> = {
  deal: ['ID', 'TITLE', 'OPPORTUNITY', 'CURRENCY_ID', 'CLOSED', 'CLOSEDATE', 'STAGE_ID'],
  contact: ['ID', 'NAME', 'LAST_NAME', 'EMAIL', 'PHONE', 'POST'],
  company: ['ID', 'TITLE', 'WEB', 'INDUSTRY'],
  lead: ['ID', 'NAME', 'LAST_NAME', 'TITLE', 'EMAIL', 'PHONE'],
};

async function getAccessToken(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
): Promise<string> {
  const { data } = await admin
    .from('workspace_secrets')
    .select('key_value')
    .eq('workspace_id', workspaceId)
    .eq('key_name', 'bitrix24_access_token')
    .maybeSingle();
  const token = (data as { key_value?: string } | null)?.key_value;
  if (!token) throw new Error('Bitrix24 não conectado neste workspace');
  return token;
}

interface BitrixListResponse {
  result?: Record<string, unknown>[];
  next?: number;
  error_description?: string;
}

async function fetchPage(
  domain: string,
  token: string,
  method: string,
  select: string[],
  start: number,
): Promise<BitrixListResponse> {
  const resp = await withRetry(
    () =>
      fetch(`https://${domain}/rest/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ select, start, order: { ID: 'ASC' } }),
      }),
    { attempts: 3, baseMs: 400, capMs: 4000 },
  );
  return (await resp.json()) as BitrixListResponse;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);
  if (req.method !== 'POST') return errorResponse(req, 'Método não permitido', 405);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user } = auth;

    const rate = await checkRateLimit(getRateLimitIdentifier(req, user.id), RATE_LIMITS.heavy);
    if (!rate.allowed) return createRateLimitResponse(rate);

    const parsed = await parseBody(req, SyncInput);
    if (parsed.error) return parsed.error;
    const { workspace_id, entities, max_pages } = parsed.data;

    // Autorização: o workspace vem do cliente, então precisa ser validado aqui.
    const adminForAuthz = createAdminClient();
    const isMember = await validateWorkspaceMembership(adminForAuthz, user.id, workspace_id);
    if (!isMember) {
      return errorResponse(req, 'Sem acesso a este workspace', 403);
    }

    const domain = Deno.env.get('BITRIX24_DOMAIN');
    if (!domain) return errorResponse(req, 'BITRIX24_DOMAIN não configurado', 503);

    const admin = adminForAuthz;
    const token = await getAccessToken(admin, workspace_id);

    const summary: Record<string, { inserted: number; updated: number; failed: number }> = {};

    for (const entity of entities) {
      const stats = { inserted: 0, updated: 0, failed: 0 };
      let start = 0;
      for (let page = 0; page < max_pages; page++) {
        const body = await fetchPage(
          domain,
          token,
          LIST_METHOD[entity],
          SELECT_FIELDS[entity],
          start,
        );
        if (body.error_description) {
          throw new Error(`Bitrix24 ${entity}: ${body.error_description}`);
        }
        const items = body.result ?? [];
        for (const fields of items) {
          try {
            const result = await upsertFromBitrix(admin, {
              workspaceId: workspace_id,
              eventType: EVENT_BY_ENTITY[entity],
              fields,
              hydrated: true,
            });
            if (result?.action === 'inserted') stats.inserted++;
            else if (result?.action === 'updated') stats.updated++;
          } catch (err) {
            // Uma linha ruim não pode abortar a reconciliação inteira.
            stats.failed++;
            console.error(`upsert ${entity} falhou`, err);
          }
        }
        if (typeof body.next !== 'number') break;
        start = body.next;
      }
      summary[entity] = stats;
    }

    await admin.from('crm_activities').insert({
      workspace_id,
      activity_type: 'system',
      source: 'bitrix24',
      body: 'Reconciliação crm-bitrix-sync concluída',
      metadata: { summary, entities, actor: user.id },
      actor_id: user.id,
    });

    return jsonResponse(req, { ok: true, summary });
  } catch (error) {
    console.error('crm-bitrix-sync error', error);
    return errorResponse(req, error instanceof Error ? error.message : 'Erro interno', 500);
  }
});
