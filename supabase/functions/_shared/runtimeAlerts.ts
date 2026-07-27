/**
 * _shared/runtimeAlerts.ts — alerta de erros de runtime em Edge Functions.
 *
 * Motivação: o incidente do rate limiter (`rate.success`, propriedade
 * inexistente) e os `getCorsHeaders is not defined` deixaram dezenas de
 * funções quebradas em produção sem que nada disparasse — o erro só aparecia
 * como 500 no cliente. Erros de *referência* e de *tipo* são sempre bugs de
 * código, nunca falhas transitórias: quando um deles acontece, alguém precisa
 * ser avisado imediatamente.
 *
 * O que faz:
 *  - envolve o handler da função e captura qualquer throw;
 *  - persiste o evento em public.openclaw_events (kind='runtime.error'), o que
 *    alimenta o painel de segurança/observabilidade já existente;
 *  - eleva severidade e dispara Slack quando o erro é ReferenceError/TypeError
 *    (classe de bug que derruba a função inteira, não um input ruim);
 *  - re-lança o erro: o alerta é observabilidade, jamais muda o comportamento.
 *
 * Uso:
 *   serve(withRuntimeAlert("minha-funcao", async (req) => { ... }));
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/** Erros que indicam bug de código, não entrada inválida do usuário. */
const FATAL_ERROR_NAMES = new Set(["ReferenceError", "TypeError", "SyntaxError"]);

export interface RuntimeErrorContext {
  functionName: string;
  workspaceId?: string | null;
  route?: string | null;
}

let _client: ReturnType<typeof createClient> | null = null;
function admin() {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

/** Classifica o erro: `true` quando é bug de código (alerta imediato). */
export function isFatalCodeError(err: unknown): boolean {
  if (err instanceof Error) return FATAL_ERROR_NAMES.has(err.name);
  return false;
}

async function dispatchSlack(text: string): Promise<void> {
  const webhook = Deno.env.get("SLACK_ALERT_WEBHOOK_URL");
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    // Falhar o alerta não pode mascarar o erro original — mas silenciar
    // também não: sem este log o canal quebrado seria invisível.
    console.warn(`[runtimeAlerts] falha ao notificar Slack: ${(e as Error)?.message ?? e}`);
  }
}

/**
 * Registra um erro de runtime. Nunca lança. Retorna quando terminou de gravar
 * (o caller decide se aguarda ou dispara fire-and-forget).
 */
export async function reportRuntimeError(err: unknown, ctx: RuntimeErrorContext): Promise<void> {
  const fatal = isFatalCodeError(err);
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  // Stack truncado: o suficiente para localizar o arquivo, sem inflar a linha.
  const stack = err instanceof Error && err.stack ? err.stack.slice(0, 2000) : null;

  console.error(
    `[runtime-error]${fatal ? " FATAL" : ""} ${ctx.functionName}: ${name}: ${message}`,
  );

  const client = admin();
  if (client) {
    try {
      await client.from("openclaw_events").insert({
        workspace_id: ctx.workspaceId ?? null,
        kind: fatal ? "runtime.fatal_error" : "runtime.error",
        level: fatal ? "error" : "warn",
        source: "other",
        payload: {
          function: ctx.functionName,
          route: ctx.route ?? null,
          error_name: name,
          error_message: message,
          stack,
          ts: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.warn(`[runtimeAlerts] falha ao persistir evento: ${(e as Error)?.message ?? e}`);
    }
  }

  if (fatal) {
    await dispatchSlack(
      `:rotating_light: *${name}* em \`${ctx.functionName}\`\n> ${message}\n_Erro de código — a função está quebrada para todos os chamadores._`,
    );
  }
}

/**
 * Envolve um handler de Edge Function com captura e alerta de erros de runtime.
 * Re-lança sempre: não altera o contrato HTTP da função.
 */
export function withRuntimeAlert(
  functionName: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      await reportRuntimeError(err, {
        functionName,
        route: (() => {
          try {
            return new URL(req.url).pathname;
          } catch {
            return null;
          }
        })(),
      });
      throw err;
    }
  };
}
