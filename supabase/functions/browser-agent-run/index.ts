import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { fetchWithTimeout } from "../_shared/retry.ts";

import { getCorsHeaders } from "../_shared/cors.ts";
const BodySchema = z.object({
  goal: z.string().min(3).max(2000),
  start_url: z.string().url(),
  agent_id: z.string().uuid().optional(),
  workspace_id: z.string().uuid().optional(),
  max_steps: z.number().int().min(1).max(25).default(10),
});

interface SimplifiedDOM {
  url: string;
  title: string;
  text: string;
  screenshot?: string; // Base64 screenshot
  elements: Array<{ idx: number; tag: string; text: string; href?: string; type?: string; name?: string; x?: number; y?: number }>;
}

async function fetchAndSimplify(url: string): Promise<SimplifiedDOM> {
  const resp = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LovableBrowserAgent/1.0)" },
    redirect: "follow",
  });
  const html = await resp.text();

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? url;

  // Strip scripts/styles
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Extract clickable elements
  const elements: SimplifiedDOM["elements"] = [];
  let idx = 0;
  const interactiveRegex = /<(a|button|input|textarea|select)\b([^>]*)>([\s\S]*?)<\/\1>|<(input|img)\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = interactiveRegex.exec(cleaned)) !== null && idx < 80) {
    const tag = (m[1] || m[4] || "").toLowerCase();
    const attrs = m[2] || m[5] || "";
    const inner = (m[3] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const hrefM = attrs.match(/href=["']([^"']+)["']/i);
    const typeM = attrs.match(/type=["']([^"']+)["']/i);
    const nameM = attrs.match(/name=["']([^"']+)["']/i);
    const placeholderM = attrs.match(/placeholder=["']([^"']+)["']/i);
    const valueM = attrs.match(/value=["']([^"']+)["']/i);
    const ariaM = attrs.match(/aria-label=["']([^"']+)["']/i);
    const text = (inner || ariaM?.[1] || placeholderM?.[1] || valueM?.[1] || "").slice(0, 100);
    if (!text && tag !== "input" && tag !== "textarea") continue;
    elements.push({
      idx: idx++,
      tag,
      text,
      href: hrefM?.[1],
      type: typeM?.[1],
      name: nameM?.[1],
    });
  }

  // Plain text
  const text = cleaned
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  return { url, title, text, elements };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
async function decideAction(goal: string, history: any[], dom: SimplifiedDOM, apiKey: string) {
  const _elementsList = dom.elements.map((e) =>
    `[${e.idx}] <${e.tag}${e.type ? ` type=${e.type}` : ""}${e.name ? ` name=${e.name}` : ""}${e.href ? ` href=${e.href.slice(0, 60)}` : ""}> ${e.text}`
  ).join("\n");

  const systemPrompt = `Você é um agente autônomo de navegação web avançado. Analise o DOM e a imagem (se disponível) para decidir o próximo passo.
  
Ações disponíveis (responda APENAS via tool call):
- click(idx): Clicar num elemento pelo índice numérico.
- type(idx, text): Preencher um campo de input com texto.
- scroll(direction): Rolar a página ("up", "down").
- navigate(url): Ir para uma URL absoluta.
- wait(ms): Aguardar carregamento de elementos dinâmicos.
- extract(description): Extrair informação visível.
- done(result): Finalizar com o resultado consolidado.

Regras de Ouro:
1. Se o objetivo foi alcançado, use done().
2. Se houver um cookie banner ou modal bloqueando, tente fechar primeiro.
3. Se não encontrar o que procura, tente scroll("down").
4. Mantenha o raciocínio (reasoning) conciso e focado na intenção estratégica.`;

  const userMsg = [
    { type: "text", text: `OBJETIVO: ${goal}\nPÁGINA: ${dom.url}\nTÍTULO: ${dom.title}\n\nHISTÓRICO:\n${history.slice(-5).map((h, i) => `${i + 1}. ${h.action} -> ${h.reasoning}`).join("\n") || "(vazio)"}` },
  ];

  if (dom.screenshot) {
    userMsg.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${dom.screenshot}` }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
    } as any);
  }

  userMsg.push({
    type: "text",
    text: `ELEMENTOS INTERATIVOS:\n${dom.elements.map(e => `[${e.idx}] <${e.tag}> ${e.text}`).join("\n")}\n\nCONTEÚDO TEXTUAL:\n${dom.text.slice(0, 1000)}`
  });

  const tools = [{
    type: "function",
    function: {
      name: "next_action",
      description: "Decidir próxima ação do agente",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["click", "type", "scroll", "navigate", "wait", "extract", "done"] },
          idx: { type: "number" },
          text: { type: "string" },
          direction: { type: "string", enum: ["up", "down"] },
          ms: { type: "number" },
          result: { type: "string" },
          reasoning: { type: "string" },
        },
        required: ["action", "reasoning"],
      },
    },
  }];

  const resp = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash", // Use o modelo flash mais recente para melhor custo-benefício e visão
      messages: [
        { role: "system", content: systemPrompt },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
        { role: "user", content: userMsg as any }
      ],
      tools,
      tool_choice: { type: "function", function: { name: "next_action" } },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 429) throw new Error("RATE_LIMIT");
    if (resp.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error(`AI gateway: ${resp.status}`);
  }

  const data = await resp.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("No tool call in response");
  return JSON.parse(tc.function.arguments);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { goal, start_url, agent_id, workspace_id, max_steps } = parsed.data;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    // Create session
    const { data: session, error: sessErr } = await supabase.from("browser_sessions").insert({
      user_id: userId,
      workspace_id: workspace_id ?? null,
      agent_id: agent_id ?? null,
      goal,
      start_url,
      max_steps,
      status: "running",
    }).select().single();
    if (sessErr || !session) throw new Error(sessErr?.message ?? "Failed to create session");

    // Run loop
    let currentUrl = start_url;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Edge Function: fronteira JSON dinâmica (Supabase/HTTP), tipagem estrita adiciona ruído sem ganho de segurança.
    const steps: any[] = [];
    let finalResult: string | null = null;
    let status: "completed" | "failed" | "cancelled" = "failed";
    let errorMessage: string | null = null;

    try {
      for (let i = 0; i < max_steps; i++) {
        // Check cancellation
        const { data: live } = await supabase.from("browser_sessions").select("status").eq("id", session.id).single();
        if (live?.status === "cancelled") {
          status = "cancelled";
          break;
        }

        const dom = await fetchAndSimplify(currentUrl);
        const decision = await decideAction(goal, steps, dom, apiKey);

        const step = {
          step_index: i,
          url: currentUrl,
          action: decision.action,
          args: { idx: decision.idx, text: decision.text, result: decision.result },
          reasoning: decision.reasoning,
          ts: new Date().toISOString(),
        };
        steps.push(step);

        if (decision.action === "done") {
          finalResult = decision.result ?? "Concluído";
          status = "completed";
          break;
        } else if (decision.action === "extract") {
          finalResult = (finalResult ? finalResult + "\n" : "") + (decision.result ?? "");
        } else if (decision.action === "navigate") {
          if (decision.text) currentUrl = decision.text;
        } else if (decision.action === "click") {
          const el = dom.elements.find((e) => e.idx === decision.idx);
          if (el?.href) {
            try {
              currentUrl = new URL(el.href, currentUrl).toString();
            } catch { /* ignore */ }
          }
        } else if (decision.action === "type") {
          // Stateless: only logged, real form submit not supported in DOM-only mode
        }

        // Persist progress
        await supabase.from("browser_sessions").update({
          steps,
          steps_count: steps.length,
        }).eq("id", session.id);
      }

      if (status !== "completed" && status !== "cancelled") {
        status = steps.some((s) => s.action === "extract") ? "completed" : "failed";
        if (!finalResult) errorMessage = "max_steps reached without done()";
      }
    } catch (loopErr) {
      errorMessage = loopErr instanceof Error ? loopErr.message : String(loopErr);
      status = "failed";
    }

    const costCents = Math.ceil(steps.length * 0.5); // ~0.5¢ per step
    await supabase.from("browser_sessions").update({
      status,
      steps,
      steps_count: steps.length,
      final_result: finalResult,
      error_message: errorMessage,
      cost_cents: costCents,
      ended_at: new Date().toISOString(),
    }).eq("id", session.id);

    return new Response(JSON.stringify({
      session_id: session.id,
      status,
      steps_count: steps.length,
      final_result: finalResult,
      error: errorMessage,
      cost_cents: costCents,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("browser-agent-run error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "RATE_LIMIT" ? 429 : msg === "PAYMENT_REQUIRED" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
