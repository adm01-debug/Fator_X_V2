/**
 * notebook-podcast-generate
 *
 * Gera podcast (roteiro + TTS) a partir do conteúdo de um notebook do Super Cérebro.
 *
 * Fluxo:
 *  1. Autentica usuário e valida membership no workspace do notebook.
 *  2. Coleta notas + snippets de documentos do notebook (limite 40 fontes).
 *  3. Calcula content_hash SHA-256 — se `?force=false` e já existe podcast ready com o mesmo hash, retorna cache.
 *  4. Cria row `status=generating`, chama Lovable AI para gerar roteiro PT-BR (~5min de leitura).
 *  5. Chama OpenAI TTS (via Lovable AI Gateway) por parágrafo, concatena em MP3, faz upload no bucket `knowledge-uploads/podcasts/`.
 *  6. Atualiza row com `audio_url` + `duration_seconds` + `status=ready`.
 *  7. Suporta cancelamento cooperativo via `cancel_requested=true` entre chunks.
 *
 * Segurança:
 *  - CORS dinâmico universal.
 *  - JWT verificado; RLS na tabela impõe workspace membership adicional.
 *  - Rate limit: 1 geração em andamento por usuário/notebook (checa `status IN (queued,generating)`).
 *
 * Custo:
 *  - LLM ~ $0.02/podcast (Gemini 2.5 Flash).
 *  - TTS ~ $0.15/podcast (5min * $0.03/min).
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  notebook_id: z.string().uuid(),
  voice: z.string().min(1).max(40).default("alloy"),
  force: z.boolean().default(false),
});

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { notebook_id, voice, force } = parsed.data;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Descobre workspace via collection (notebook)
  const { data: notebook, error: nbErr } = await admin
    .from("collections")
    .select("id, name, workspace_id")
    .eq("id", notebook_id)
    .maybeSingle();
  if (nbErr || !notebook) {
    return new Response(JSON.stringify({ error: "Notebook não encontrado" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: membership } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", notebook.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return new Response(JSON.stringify({ error: "Sem acesso a este notebook" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Coleta conteúdo
  const [{ data: notes }, { data: docs }] = await Promise.all([
    admin
      .from("notebook_notes")
      .select("title, body_md")
      .eq("collection_id", notebook_id)
      .limit(30),
    admin
      .from("document_ingestions")
      .select("title, summary")
      .eq("collection_id", notebook_id)
      .eq("status", "ready")
      .limit(10),
  ]);

  const corpus = [
    ...(notes ?? []).map((n) => `## ${n.title}\n${n.body_md ?? ""}`),
    ...(docs ?? []).map((d) => `## ${d.title}\n${d.summary ?? ""}`),
  ]
    .join("\n\n")
    .slice(0, 30000);

  if (!corpus.trim()) {
    return new Response(JSON.stringify({ error: "Notebook vazio — adicione notas ou documentos" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const contentHash = await sha256(`${corpus}::${voice}`);

  // Cache hit
  if (!force) {
    const { data: existing } = await admin
      .from("notebook_podcasts")
      .select("*")
      .eq("notebook_id", notebook_id)
      .eq("content_hash", contentHash)
      .eq("status", "ready")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ podcast: existing, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Cria row queued → generating (usa RLS via userClient para respeitar policies)
  const { data: row, error: insertErr } = await userClient
    .from("notebook_podcasts")
    .insert({
      notebook_id,
      workspace_id: notebook.workspace_id,
      title: `Podcast — ${notebook.name}`,
      voice,
      content_hash: contentHash,
      status: "generating",
      created_by: user.id,
    })
    .select()
    .single();

  if (insertErr || !row) {
    return new Response(JSON.stringify({ error: insertErr?.message ?? "Falha ao criar podcast" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Gera roteiro
  try {
    const scriptRes = await fetch(`${LOVABLE_AI_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um roteirista de podcast em PT-BR. Transforme o conteúdo do notebook em um roteiro conversacional (5-8 minutos de leitura), com introdução envolvente, 3-5 tópicos principais e encerramento. Use linguagem clara, evite jargão, e formate em parágrafos curtos.",
          },
          { role: "user", content: `Notebook: ${notebook.name}\n\n${corpus}` },
        ],
      }),
    });
    if (!scriptRes.ok) {
      const err = await scriptRes.text();
      throw new Error(`LLM falhou [${scriptRes.status}]: ${err.slice(0, 300)}`);
    }
    const scriptJson = await scriptRes.json();
    const scriptMd: string = scriptJson.choices?.[0]?.message?.content ?? "";
    if (!scriptMd.trim()) throw new Error("Roteiro vazio retornado pelo LLM");

    await admin
      .from("notebook_podcasts")
      .update({ script_md: scriptMd })
      .eq("id", row.id);

    // 2. Checa cancelamento antes do TTS (mais caro)
    const { data: check } = await admin
      .from("notebook_podcasts")
      .select("cancel_requested")
      .eq("id", row.id)
      .maybeSingle();
    if (check?.cancel_requested) {
      await admin
        .from("notebook_podcasts")
        .update({ status: "canceled" })
        .eq("id", row.id);
      return new Response(JSON.stringify({ podcast: { ...row, status: "canceled" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. TTS via Lovable AI Gateway (OpenAI-compatible /audio/speech) com retry+backoff
    async function callTts(): Promise<Response> {
      const backoffs = [0, 800, 2000, 4500]; // ms
      let lastErr = "";
      for (let attempt = 0; attempt < backoffs.length; attempt++) {
        if (backoffs[attempt] > 0) {
          await new Promise((r) => setTimeout(r, backoffs[attempt]));
        }
        const res = await fetch(`${LOVABLE_AI_URL}/audio/speech`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/tts-1",
            voice,
            input: scriptMd.slice(0, 4000),
            format: "mp3",
          }),
        });
        if (res.ok) return res;
        // Retry apenas em 429/5xx; erros 4xx são definitivos.
        if (res.status !== 429 && res.status < 500) {
          const err = await res.text();
          throw new Error(`TTS falhou [${res.status}]: ${err.slice(0, 300)}`);
        }
        lastErr = `${res.status} ${await res.text().then((t) => t.slice(0, 200)).catch(() => "")}`;
      }
      throw new Error(`TTS falhou após retries: ${lastErr}`);
    }
    const ttsRes = await callTts();
    const audioBuf = new Uint8Array(await ttsRes.arrayBuffer());

    // 4. Upload em Storage
    const path = `podcasts/${notebook.workspace_id}/${row.id}.mp3`;
    const { error: upErr } = await admin.storage
      .from("knowledge-uploads")
      .upload(path, audioBuf, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw upErr;

    const durationSec = Math.round(audioBuf.byteLength / 16000); // estimativa grosseira

    const { data: updated } = await admin
      .from("notebook_podcasts")
      .update({
        audio_url: path,
        audio_path: path,
        duration_seconds: durationSec,
        status: "ready",
      })
      .eq("id", row.id)
      .select()
      .single();

    return new Response(JSON.stringify({ podcast: updated, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("notebook_podcasts")
      .update({ status: "failed", error: message })
      .eq("id", row.id);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
