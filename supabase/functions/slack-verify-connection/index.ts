/**
 * slack-verify-connection
 *
 * Chama auth.test com o SLACK_BOT_TOKEN, valida e grava
 * `slack_workspace_config` do workspace do usuário.
 * Requer JWT do usuário (verify_jwt=true padrão).
 */
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { z } from "npm:zod@3.23.8";
import { handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { slackApiCall } from "../_shared/slack.ts";

const BodySchema = z.object({ workspace_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  if (req.method !== "POST") return errorResponse(req, "Method not allowed", 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return errorResponse(req, "Unauthorized", 401);

  let body;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse(req, "Invalid payload", 400, {
      details: err instanceof z.ZodError ? err.flatten() : String(err),
    });
  }

  if (!Deno.env.get("SLACK_BOT_TOKEN")) {
    return errorResponse(req, "SLACK_BOT_TOKEN não configurado", 503);
  }
  if (!Deno.env.get("SLACK_SIGNING_SECRET")) {
    return errorResponse(req, "SLACK_SIGNING_SECRET não configurado", 503);
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return errorResponse(req, "Unauthorized", 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: isAdmin, error: rbacErr } = await svc.rpc("is_workspace_admin", {
    _workspace_id: body.workspace_id,
    _user_id: userData.user.id,
  });
  if (rbacErr || !isAdmin) return errorResponse(req, "Forbidden", 403);

  let authTest;
  try {
    authTest = await slackApiCall<{
      team_id: string;
      team: string;
      user_id: string;
      user: string;
      bot_id?: string;
    }>("auth.test", {});
  } catch (err) {
    return errorResponse(req, "Falha ao verificar Slack", 502, {
      details: err instanceof Error ? err.message : String(err),
    });
  }
  if (!authTest.ok) {
    return errorResponse(req, `Slack rejeitou o token: ${authTest.error}`, 400);
  }

  const at = authTest as unknown as { team_id: string; team: string | null; user_id: string; user: string | null };
  const teamId = at.team_id;
  const teamName = at.team;
  const botUserId = at.user_id;
  const botName = at.user;

  const { error: upErr } = await svc
    .from("slack_workspace_config")
    .upsert(
      {
        workspace_id: body.workspace_id,
        slack_team_id: teamId,
        slack_team_name: teamName,
        bot_user_id: botUserId,
        bot_display_name: botName,
        installed_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: "workspace_id" }
    );
  if (upErr) return errorResponse(req, "Falha ao salvar configuração", 500, { details: upErr.message });

  await svc.from("audit_events").insert({
    workspace_id: body.workspace_id,
    event_type: "slack_integration",
    action: "workspace_verified",
    resource_type: "slack_workspace_config",
    resource_id: teamId,
    metadata: { team_name: teamName, bot_name: botName },
  });

  return jsonResponse(req, {
    ok: true,
    team_id: teamId,
    team_name: teamName,
    bot_user_id: botUserId,
    bot_name: botName,
  });
});
