import { useState } from 'react';
import { Loader2, Copy, Play, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GEN_AI, createGenAIAttributes, estimateCost } from '@/lib/otel-genai';
import { AGUI_EVENT_TYPES, createSSEEmitter, getSSEHeaders } from '@/lib/ag-ui';

const SYSTEMS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'google', label: 'Google' },
];

const PREVIEW_EVENTS: string[] = [
  AGUI_EVENT_TYPES.RUN_STARTED,
  AGUI_EVENT_TYPES.TEXT_MESSAGE_CONTENT,
  AGUI_EVENT_TYPES.TOOL_CALL_START,
  AGUI_EVENT_TYPES.TOOL_CALL_END,
  AGUI_EVENT_TYPES.STATE_DELTA,
  AGUI_EVENT_TYPES.RUN_FINISHED,
];

async function buildStreamPreview(): Promise<string> {
  const emitter = createSSEEmitter();
  const reader = emitter.stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];

  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  })();

  emitter.emit({
    type: AGUI_EVENT_TYPES.RUN_STARTED,
    timestamp: Date.now(),
    runId: 'previa',
    data: { threadId: 'previa', agent: 'nexus' },
  });
  emitter.emitText('Olá do protocolo AG-UI', 'msg-1');
  emitter.emitToolStart('call-1', 'buscar_dados');
  emitter.emitToolEnd('call-1', { ok: true, linhas: 3 });
  emitter.emitStateDelta({ etapa: 'concluido' });
  emitter.close();

  await pump;
  return chunks.join('');
}

function copyText(text: string, successMessage: string) {
  if (!navigator.clipboard) {
    toast.error('Copiar não é suportado neste navegador');
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast.success(successMessage),
    () => toast.error('Não foi possível copiar'),
  );
}

export function GenAIProtocolPanel() {
  const [system, setSystem] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [inputTokens, setInputTokens] = useState(1200);
  const [outputTokens, setOutputTokens] = useState(800);
  const [temperature, setTemperature] = useState(0.7);
  const [finishReason, setFinishReason] = useState('stop');
  const [agentName, setAgentName] = useState('Nexus');
  const [cost, setCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [frames, setFrames] = useState<string | null>(null);
  const [framesLoading, setFramesLoading] = useState(false);

  const attributes = createGenAIAttributes({
    system,
    model,
    inputTokens,
    outputTokens,
    temperature,
    finishReason,
    agentName,
  });

  const headers = getSSEHeaders() as Record<string, string>;

  const handleCopyAttributes = () => {
    copyText(JSON.stringify(attributes, null, 2), 'Atributos copiados');
  };

  const handleCopyFrames = () => {
    if (frames) copyText(frames, 'Frames copiados');
  };

  const handleEstimateCost = async () => {
    setCostLoading(true);
    try {
      const value = await estimateCost(model, inputTokens, outputTokens);
      setCost(value);
    } catch {
      toast.error('Não foi possível estimar o custo');
    } finally {
      setCostLoading(false);
    }
  };

  const handleStreamPreview = async () => {
    setFramesLoading(true);
    try {
      setFrames(await buildStreamPreview());
    } catch {
      toast.error('Não foi possível gerar a prévia do stream');
    } finally {
      setFramesLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="nexus-card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-body font-bold text-foreground flex items-center gap-2">
              <Radio className="h-4 w-4 text-nexus-emerald" /> Atributos GenAI (OpenTelemetry)
            </h3>
            <p className="text-meta text-muted-foreground mt-1">
              Convenções semânticas gen_ai.* no padrão OpenTelemetry, aceitas por Langfuse, Arize
              Phoenix, Weights &amp; Biases e Datadog LLM. Monte os atributos da chamada e exporte
              como JSON para o coletor.
            </p>
          </div>
          <Badge variant="outline" className="text-meta shrink-0">
            {Object.keys(attributes).length} atributos
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="genai-system" className="text-meta">
              Sistema
            </Label>
            <Select value={system} onValueChange={setSystem}>
              <SelectTrigger id="genai-system" className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYSTEMS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-model" className="text-meta">
              Modelo
            </Label>
            <Input
              id="genai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-agent" className="text-meta">
              Agente
            </Label>
            <Input
              id="genai-agent"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-input" className="text-meta">
              Tokens de entrada
            </Label>
            <Input
              id="genai-input"
              type="number"
              min={0}
              value={inputTokens}
              onChange={(e) => setInputTokens(Number(e.target.value) || 0)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-output" className="text-meta">
              Tokens de saída
            </Label>
            <Input
              id="genai-output"
              type="number"
              min={0}
              value={outputTokens}
              onChange={(e) => setOutputTokens(Number(e.target.value) || 0)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-temp" className="text-meta">
              Temperatura
            </Label>
            <Input
              id="genai-temp"
              type="number"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value) || 0)}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="genai-finish" className="text-meta">
              Motivo de término
            </Label>
            <Input
              id="genai-finish"
              value={finishReason}
              onChange={(e) => setFinishReason(e.target.value)}
              className="bg-background border-border"
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border/40 bg-secondary/20 divide-y divide-border/30">
          {Object.entries(attributes).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <code className="text-meta font-mono text-muted-foreground">{key}</code>
              <span className="text-meta font-medium text-foreground truncate">
                {String(value)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={handleCopyAttributes} className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Copiar atributos
          </Button>
          <Button size="sm" onClick={handleEstimateCost} disabled={costLoading} className="gap-2">
            {costLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Estimar custo
          </Button>
          {cost !== null && (
            <span className="text-meta text-muted-foreground">
              Custo estimado:{' '}
              <strong className="text-foreground font-bold">US$ {cost.toFixed(6)}</strong> (
              {inputTokens + outputTokens} tokens) — valor da edge{' '}
              <code className="font-mono">cost-calculator</code>, com tabela local como reserva.
            </span>
          )}
        </div>
      </div>

      <div className="nexus-card p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-body font-bold text-foreground flex items-center gap-2">
              <Radio className="h-4 w-4 text-nexus-emerald" /> Protocolo AG-UI — stream SSE
            </h3>
            <p className="text-meta text-muted-foreground mt-1">
              Formato de resposta que as edges devolvem para a UI acompanhar o agente em tempo real
              (16 tipos de evento, cabeçalho{' '}
              <code className="font-mono">X-Protocol: ag-ui/1.0</code>). A prévia abaixo é o stream
              real gerado pelo emissor, sem mock.
            </p>
          </div>
          <Badge variant="outline" className="text-meta shrink-0">
            {Object.keys(AGUI_EVENT_TYPES).length} tipos
          </Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-meta font-bold text-foreground mb-2">Cabeçalhos da resposta</p>
            <div className="rounded-xl border border-border/40 bg-secondary/20 divide-y divide-border/30">
              {Object.entries(headers).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <code className="text-meta font-mono text-muted-foreground">{key}</code>
                  <span className="text-meta font-medium text-foreground truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-meta font-bold text-foreground mb-2">Tipos de evento do protocolo</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(AGUI_EVENT_TYPES).map(([key, value]) => {
                const used = PREVIEW_EVENTS.includes(value);
                return (
                  <Badge
                    key={key}
                    variant={used ? 'default' : 'outline'}
                    className={`text-meta font-mono ${used ? 'bg-primary/10 text-primary border-none' : ''}`}
                  >
                    {value}
                  </Badge>
                );
              })}
            </div>
            <p className="text-meta text-muted-foreground mt-2">
              Em destaque, os eventos emitidos na prévia: início e fim da execução, texto, chamada
              de ferramenta e mudança de estado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button
            size="sm"
            onClick={handleStreamPreview}
            disabled={framesLoading}
            className="gap-2"
          >
            {framesLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Gerar prévia do stream
          </Button>
          {frames && (
            <Button variant="outline" size="sm" onClick={handleCopyFrames} className="gap-2">
              <Copy className="h-3.5 w-3.5" /> Copiar frames
            </Button>
          )}
        </div>

        {frames && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/40 bg-secondary/20 p-3 text-meta font-mono text-muted-foreground whitespace-pre-wrap">
            {frames}
          </pre>
        )}
      </div>

      <p className="text-meta text-muted-foreground">
        Chaves publicadas pelo Fator_X para padronização de telemetria: {Object.keys(GEN_AI).length}{' '}
        chaves semânticas (gen_ai.* e nexus.*) disponíveis para exportação.
      </p>
    </div>
  );
}
