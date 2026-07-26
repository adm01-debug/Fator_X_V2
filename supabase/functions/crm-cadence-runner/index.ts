/**
 * crm-cadence-runner — Executor da fila de cadências de vendas.
 *
 * Modelo de execução: pull, não push. O cron chama esta função; ela reivindica
 * um lote da fila via `claim_due_cadence_enrollments` (FOR UPDATE SKIP LOCKED)
 * e processa. Duas execuções sobrepostas nunca tocam a mesma inscrição, e um
 * worker que morre no meio devolve o trabalho à fila quando o lease expira.
 *
 * Guardas de saída (verificadas ANTES de qualquer envio, nesta ordem):
 *   1. negócio não está mais aberto  → para (ganhou/perdeu, cadência perdeu sentido)
 *   2. contato pediu descadastro     → para (obrigação legal, nunca negociável)
 *   3. canal sem destino utilizável  → para (e-mail nulo não vira envio silencioso)
 *
 * Falha em um envio NÃO derruba o lote: a inscrição acumula tentativa e volta
 * à fila; ao esgotar o teto, vira `failed` com o erro registrado para triagem.
 */
import {
  authenticateRequest,
  createAdminClient,
  errorResponse,
  handleCorsPreflight,
  jsonResponse,
  parseBody,
  validateWorkspaceMembership,
  z,
} from "../_shared/mod.ts";
// slackApiCall não faz parte do barrel — import direto evita inchar o bundle.
import { slackApiCall } from "../_shared/slack.ts";

const RunnerInput = z.object({
  /** Teto de inscrições por execução — mantém a função dentro do tempo limite. */
  batch_size: z.number().int().min(1).max(200).default(50),
  /** Presente = execução manual de um workspace; ausente = cron global. */
  workspace_id: z.string().uuid().optional(),
  /** Simula sem enviar nem avançar — usado pela UI para prever o lote. */
  dry_run: z.boolean().default(false),
});

/** Vocabulário fechado de `crm_activities.activity_type` (CHECK no banco). */
const ACTIVITY_TYPE_BY_CHANNEL: Record<StepRow["channel"], string> = {
  email: "email",
  whatsapp: "message",
  slack: "message",
  task: "task",
};

/** Após 5 tentativas o problema é estrutural, não transitório. */
const MAX_ATTEMPTS = 5;

interface ClaimedEnrollment {
  id: string;
  workspace_id: string;
  cadence_id: string;
  deal_id: string;
  contact_id: string | null;
  current_step: number;
  attempts: number;
}

interface StepRow {
  position: number;
  channel: "email" | "whatsapp" | "slack" | "task";
  delay_hours: number;
  subject: string | null;
  body: string;
}

/** Substituição de variáveis sem `eval` e sem regex dinâmica vinda de dado do usuário. */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const value = vars[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

type Admin = ReturnType<typeof createAdminClient>;

async function stopEnrollment(
  admin: Admin,
  enrollmentId: string,
  reason: string,
  status: "stopped" | "completed" | "failed" = "stopped",
): Promise<void> {
  await admin
    .from("crm_cadence_enrollments")
    .update({ status, stop_reason: reason, next_run_at: new Date().toISOString() })
    .eq("id", enrollmentId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  if (req.method !== "POST") return errorResponse(req, "Método não permitido", 405);

  try {
    const parsed = await parseBody(req, RunnerInput);
    if (parsed.error) return parsed.error;
    const { batch_size, workspace_id, dry_run } = parsed.data;

    const admin = createAdminClient();

    // Execução manual precisa de usuário autenticado E membro do workspace.
    // Execução por cron chega sem usuário e opera sobre a fila global.
    if (workspace_id) {
      const auth = await authenticateRequest(req);
      if (auth.error) return auth.error;
      const isMember = await validateWorkspaceMembership(admin, auth.user.id, workspace_id);
      if (!isMember) return errorResponse(req, "Sem acesso a este workspace", 403);
    }

    const { data: claimedData, error: claimError } = await admin.rpc(
      "claim_due_cadence_enrollments",
      { p_limit: batch_size, p_lease_minutes: 10 },
    );
    if (claimError) throw claimError;

    let claimed = (claimedData ?? []) as ClaimedEnrollment[];
    // O filtro por workspace acontece pós-claim de propósito: a reivindicação
    // precisa ser um único statement atômico para não abrir janela de corrida.
    // As inscrições de outros workspaces voltam à fila quando o lease expira.
    if (workspace_id) claimed = claimed.filter((e) => e.workspace_id === workspace_id);

    const summary = { claimed: claimed.length, sent: 0, completed: 0, stopped: 0, failed: 0, skipped: 0 };
    const details: Array<Record<string, unknown>> = [];

    for (const enrollment of claimed) {
      try {
        const [dealRes, contactRes, stepsRes] = await Promise.all([
          admin
            .from("crm_deals")
            .select("id, title, status, company_id")
            .eq("id", enrollment.deal_id)
            .maybeSingle(),
          enrollment.contact_id
            ? admin
              .from("crm_contacts")
              .select("id, full_name, email, phone, opted_out")
              .eq("id", enrollment.contact_id)
              .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          admin
            .from("crm_cadence_steps")
            .select("position, channel, delay_hours, subject, body")
            .eq("cadence_id", enrollment.cadence_id)
            .order("position", { ascending: true }),
        ]);

        if (dealRes.error) throw dealRes.error;
        if (stepsRes.error) throw stepsRes.error;

        const deal = dealRes.data as { title: string; status: string; company_id: string | null } | null;
        const contact = contactRes.data as
          | { full_name: string; email: string | null; phone: string | null; opted_out: boolean }
          | null;
        const steps = (stepsRes.data ?? []) as StepRow[];

        // Guarda 1 — negócio fechado.
        if (!deal || deal.status !== "open") {
          if (!dry_run) await stopEnrollment(admin, enrollment.id, "deal_not_open");
          summary.stopped++;
          continue;
        }

        // Guarda 2 — descadastro. Verificado a cada passo, não só na inscrição:
        // o contato pode optar por sair no meio da sequência.
        if (contact?.opted_out) {
          if (!dry_run) await stopEnrollment(admin, enrollment.id, "contact_opted_out");
          summary.stopped++;
          continue;
        }

        const step = steps.find((s) => s.position === enrollment.current_step);
        if (!step) {
          if (!dry_run) await stopEnrollment(admin, enrollment.id, "no_more_steps", "completed");
          summary.completed++;
          continue;
        }

        // Guarda 3 — canal sem destino.
        const needsEmail = step.channel === "email";
        const needsPhone = step.channel === "whatsapp";
        if ((needsEmail && !contact?.email) || (needsPhone && !contact?.phone)) {
          if (!dry_run) await stopEnrollment(admin, enrollment.id, `missing_${step.channel}_target`);
          summary.stopped++;
          continue;
        }

        let companyName = "";
        if (deal.company_id) {
          const { data: company } = await admin
            .from("crm_companies")
            .select("name")
            .eq("id", deal.company_id)
            .maybeSingle();
          companyName = (company as { name?: string } | null)?.name ?? "";
        }

        const rendered = renderTemplate(step.body, {
          contato: contact?.full_name ?? "",
          primeiro_nome: (contact?.full_name ?? "").split(" ")[0] ?? "",
          empresa: companyName,
          negocio: deal.title,
        });

        if (dry_run) {
          summary.skipped++;
          details.push({ enrollment: enrollment.id, step: step.position, channel: step.channel, preview: rendered });
          continue;
        }

        // Entrega. Slack tem despacho direto; os demais canais são registrados
        // como atividade para o conector correspondente consumir — registrar é
        // o contrato aqui, e é ele que mantém a linha do tempo do negócio fiel.
        if (step.channel === "slack") {
          // O token é global (secret SLACK_BOT_TOKEN); o canal vem da rota do
          // workspace, então cada time recebe no seu próprio canal.
          const { data: route } = await admin
            .from("slack_channel_routes")
            .select("channel_id")
            .eq("workspace_id", enrollment.workspace_id)
            .eq("enabled", true)
            .limit(1)
            .maybeSingle();
          const channelId = (route as { channel_id?: string } | null)?.channel_id;
          if (!channelId) {
            await stopEnrollment(admin, enrollment.id, "slack_not_configured");
            summary.stopped++;
            continue;
          }
          const slackResult = await slackApiCall("chat.postMessage", {
            channel: channelId,
            text: rendered,
          });
          // Slack responde HTTP 200 mesmo em erro — `ok` é a fonte da verdade.
          if (!slackResult.ok) throw new Error(`slack:${slackResult.error ?? "unknown"}`);
        }

        await admin.from("crm_activities").insert({
          workspace_id: enrollment.workspace_id,
          deal_id: enrollment.deal_id,
          contact_id: enrollment.contact_id,
          // `crm_activities.activity_type` tem CHECK fechado — o canal da
          // cadência precisa ser traduzido para o vocabulário da tabela.
          activity_type: ACTIVITY_TYPE_BY_CHANNEL[step.channel],
          source: "cadence",
          body: rendered,
          metadata: {
            cadence_id: enrollment.cadence_id,
            step: step.position,
            channel: step.channel,
            subject: step.subject,
          },
        });

        const nextStep = steps.find((s) => s.position > step.position);
        if (nextStep) {
          const nextRun = new Date(Date.now() + nextStep.delay_hours * 3_600_000).toISOString();
          await admin
            .from("crm_cadence_enrollments")
            .update({
              current_step: nextStep.position,
              next_run_at: nextRun,
              // Tentativas contam por passo: um passo saudável zera a dívida do anterior.
              attempts: 0,
              last_error: null,
              last_sent_at: new Date().toISOString(),
            })
            .eq("id", enrollment.id);
        } else {
          await admin
            .from("crm_cadence_enrollments")
            .update({
              status: "completed",
              stop_reason: "sequence_finished",
              last_sent_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", enrollment.id);
          summary.completed++;
        }
        summary.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("crm-cadence-runner passo falhou", enrollment.id, message);
        if (!dry_run) {
          if (enrollment.attempts >= MAX_ATTEMPTS) {
            await admin
              .from("crm_cadence_enrollments")
              .update({ status: "failed", last_error: message, stop_reason: "max_attempts" })
              .eq("id", enrollment.id);
            summary.failed++;
          } else {
            // Backoff exponencial no lease: 2^tentativa minutos, teto de 2h.
            const backoffMin = Math.min(2 ** enrollment.attempts, 120);
            await admin
              .from("crm_cadence_enrollments")
              .update({
                last_error: message,
                next_run_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
              })
              .eq("id", enrollment.id);
          }
        }
      }
    }

    return jsonResponse(req, { ok: true, dry_run, summary, details: dry_run ? details : undefined });
  } catch (error) {
    console.error("crm-cadence-runner error", error);
    return errorResponse(req, error instanceof Error ? error.message : "Erro interno", 500);
  }
});
