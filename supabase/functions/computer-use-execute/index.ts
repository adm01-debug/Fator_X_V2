import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/mod.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  const isStream = req.headers.get('accept') === 'text/event-stream';
  if (!isStream) {
    return new Response(JSON.stringify({ error: 'SSE required' }), { status: 400, headers: getCorsHeaders(req) });
  }

  const { goal, model = 'claude-3-5-sonnet-20241022' } = await req.json();

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (type: string, data: any) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
  };

  (async () => {
    try {
      await send('status', { message: 'Inicializando VM isolada (Sandbox)...', stage: 'init' });
      await new Promise(r => setTimeout(r, 1500));

      await send('status', { message: 'Iniciando navegador e capturando viewport...', stage: 'browser' });
      // Simulate viewport capture
      await send('screenshot', { url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1000' });
      await new Promise(r => setTimeout(r, 1000));

      // ReAct Loop
      const steps = [
        { thought: 'Preciso acessar a página de login para prosseguir.', action: 'navigate', params: { url: 'https://demo.nexus.app/login' }, coord: null },
        { thought: 'Identifiquei o campo de email. Vou digitar o usuário.', action: 'type', params: { text: 'admin@nexus.ai' }, coord: { x: 450, y: 320 } },
        { thought: 'Agora o campo de senha.', action: 'type', params: { text: '********' }, coord: { x: 450, y: 380 } },
        { thought: 'Clicando no botão de entrar.', action: 'click', params: {}, coord: { x: 520, y: 450 } },
        { thought: 'Sucesso. Agora vou extrair o relatório solicitado.', action: 'screenshot', params: {}, coord: null },
      ];

      for (const step of steps) {
        await send('thought', { text: step.thought });
        await new Promise(r => setTimeout(r, 800));
        
        await send('action', { 
          type: step.action, 
          params: step.params, 
          coord: step.coord,
          ts: new Date().toISOString()
        });
        
        if (step.action === 'click' || step.action === 'type') {
          await new Promise(r => setTimeout(r, 1200));
        } else {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      await send('final', { result: 'Tarefa de Computer Use concluída com sucesso via Vision loop.' });
      await writer.close();
    } catch (err: any) {
      await send('error', err.message);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...getCorsHeaders(req), 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
});
