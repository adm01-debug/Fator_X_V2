import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type {
  SkillExecution,
  SkillExecutionKind,
  WorkflowStep,
} from '@/lib/skillComposer/skillDraft';
import { newId } from '@/lib/skillComposer/skillDraft';

interface ExecutionBuilderProps {
  execution: SkillExecution;
  onChange: (execution: SkillExecution) => void;
}

const KIND_LABELS: Record<SkillExecutionKind, { label: string; hint: string }> = {
  http: { label: 'Chamada HTTP', hint: 'Chama uma API externa (REST).' },
  llm: { label: 'Prompt LLM', hint: 'Envia o prompt para um modelo de IA.' },
  workflow: { label: 'Workflow', hint: 'Executa passos sequenciais.' },
  rag: { label: 'RAG (busca semântica)', hint: 'Busca em uma base de conhecimento.' },
  integration: { label: 'Integração', hint: 'Chama um conector (Slack, CRM, etc).' },
};

export function ExecutionBuilder({ execution, onChange }: ExecutionBuilderProps) {
  const setKind = (kind: SkillExecutionKind) => onChange({ ...execution, kind });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Modo de execução</Label>
        <Select value={execution.kind} onValueChange={(v) => setKind(v as SkillExecutionKind)}>
          <SelectTrigger className="w-full sm:w-[320px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as SkillExecutionKind[]).map((k) => (
              <SelectItem key={k} value={k}>{KIND_LABELS[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-meta text-muted-foreground">{KIND_LABELS[execution.kind].hint}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        {execution.kind === 'http' && (
          <HttpEditor
            value={execution.http}
            onChange={(v) => onChange({ ...execution, http: v })}
          />
        )}
        {execution.kind === 'llm' && (
          <LlmEditor
            value={execution.llm}
            onChange={(v) => onChange({ ...execution, llm: v })}
          />
        )}
        {execution.kind === 'workflow' && (
          <WorkflowEditor
            value={execution.workflow}
            onChange={(v) => onChange({ ...execution, workflow: v })}
          />
        )}
        {execution.kind === 'rag' && (
          <RagEditor
            value={execution.rag}
            onChange={(v) => onChange({ ...execution, rag: v })}
          />
        )}
        {execution.kind === 'integration' && (
          <IntegrationEditor
            value={execution.integration}
            onChange={(v) => onChange({ ...execution, integration: v })}
          />
        )}
      </div>
    </div>
  );
}

// ------------- HTTP -------------
type HttpExec = SkillExecution['http'];

function HttpEditor({ value, onChange }: { value: HttpExec; onChange: (v: HttpExec) => void }) {
  const addHeader = () => onChange({ ...value, headers: [...value.headers, { key: '', value: '' }] });
  const updHeader = (i: number, patch: Partial<{ key: string; value: string }>) =>
    onChange({ ...value, headers: value.headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  const rmHeader = (i: number) =>
    onChange({ ...value, headers: value.headers.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="space-y-1.5">
          <Label>Método</Label>
          <Select
            value={value.method}
            onValueChange={(v) => onChange({ ...value, method: v as HttpExec['method'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>URL</Label>
          <Input
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
            placeholder="https://api.example.com/v1/contacts/{{contato_id}}"
            className="font-mono"
            spellCheck={false}
            maxLength={500}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Headers</Label>
          <Button size="sm" variant="outline" onClick={addHeader} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Header
          </Button>
        </div>
        {value.headers.length === 0 ? (
          <p className="text-meta text-muted-foreground">Nenhum header configurado.</p>
        ) : (
          <ul className="space-y-2">
            {value.headers.map((h, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  value={h.key}
                  onChange={(e) => updHeader(i, { key: e.target.value })}
                  placeholder="Authorization"
                  className="font-mono"
                  maxLength={80}
                />
                <Input
                  value={h.value}
                  onChange={(e) => updHeader(i, { value: e.target.value })}
                  placeholder="Bearer {{token}}"
                  className="font-mono"
                  maxLength={200}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => rmHeader(i)}
                  aria-label="Remover header"
                  className="text-destructive hover:bg-destructive/10 h-9 w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Body (JSON template)</Label>
        <Textarea
          value={value.bodyTemplate}
          onChange={(e) => onChange({ ...value, bodyTemplate: e.target.value })}
          rows={5}
          className="font-mono text-meta"
          spellCheck={false}
          maxLength={2000}
          placeholder={'{\n  "query": "{{consulta}}"\n}'}
        />
      </div>
    </div>
  );
}

// ------------- LLM -------------
type LlmExec = SkillExecution['llm'];

function LlmEditor({ value, onChange }: { value: LlmExec; onChange: (v: LlmExec) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Provider</Label>
          <Select
            value={value.provider}
            onValueChange={(v) => onChange({ ...value, provider: v as LlmExec['provider'] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lovable-ai">Lovable AI (recomendado)</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Input
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            className="font-mono"
            maxLength={80}
            placeholder="google/gemini-2.5-flash"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Temperatura</Label>
            <Badge variant="outline" className="text-meta font-mono">
              {value.temperature.toFixed(2)}
            </Badge>
          </div>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={[value.temperature]}
            onValueChange={([v]) => onChange({ ...value, temperature: v })}
          />
          <p className="text-meta text-muted-foreground">
            0 = determinístico · 2 = criativo
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Máximo de tokens</Label>
          <Input
            type="number"
            min={1}
            max={32000}
            value={value.maxTokens}
            onChange={(e) => onChange({ ...value, maxTokens: Number(e.target.value) || 1 })}
          />
        </div>
      </div>
    </div>
  );
}

// ------------- Workflow -------------
type WorkflowExec = SkillExecution['workflow'];

const ACTION_LABELS: Record<WorkflowStep['action'], string> = {
  transform: 'Transformar dados',
  http_call: 'Chamada HTTP',
  llm_call: 'Chamada LLM',
  delay: 'Aguardar',
  notify: 'Notificar',
};

function WorkflowEditor({ value, onChange }: { value: WorkflowExec; onChange: (v: WorkflowExec) => void }) {
  const add = () =>
    onChange({
      steps: [
        ...value.steps,
        { id: newId(), name: `passo_${value.steps.length + 1}`, action: 'transform', params: '' },
      ],
    });
  const upd = (id: string, patch: Partial<WorkflowStep>) =>
    onChange({ steps: value.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const rm = (id: string) => onChange({ steps: value.steps.filter((s) => s.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    const idx = value.steps.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= value.steps.length) return;
    const copy = [...value.steps];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    onChange({ steps: copy });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Passos do workflow</Label>
        <Button size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Passo
        </Button>
      </div>

      {value.steps.length === 0 ? (
        <p className="text-meta text-muted-foreground">Adicione ao menos um passo.</p>
      ) : (
        <ol className="space-y-2">
          {value.steps.map((s, idx) => (
            <li key={s.id} className="rounded-md border border-border p-3 space-y-2 bg-background">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-meta">
                  #{idx + 1}
                </Badge>
                <Input
                  value={s.name}
                  onChange={(e) => upd(s.id, { name: e.target.value })}
                  placeholder="nome_do_passo"
                  className="font-mono flex-1"
                  maxLength={60}
                />
                <Select
                  value={s.action}
                  onValueChange={(v) => upd(s.id, { action: v as WorkflowStep['action'] })}
                >
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABELS) as Array<WorkflowStep['action']>).map((a) => (
                      <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => move(s.id, -1)} disabled={idx === 0} aria-label="Subir" className="h-8 w-8">↑</Button>
                  <Button size="icon" variant="ghost" onClick={() => move(s.id, 1)} disabled={idx === value.steps.length - 1} aria-label="Descer" className="h-8 w-8">↓</Button>
                  <Button size="icon" variant="ghost" onClick={() => rm(s.id)} aria-label="Remover" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={s.params}
                onChange={(e) => upd(s.id, { params: e.target.value })}
                rows={2}
                placeholder="Parâmetros (ex: chave=valor, url, template...)"
                className="font-mono text-meta"
                maxLength={500}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ------------- RAG -------------
type RagExec = SkillExecution['rag'];

function RagEditor({ value, onChange }: { value: RagExec; onChange: (v: RagExec) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Base de conhecimento (collection)</Label>
        <Input
          value={value.collection}
          onChange={(e) => onChange({ ...value, collection: e.target.value })}
          placeholder="produtos-catalogo"
          maxLength={120}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Top K (nº de resultados)</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={value.topK}
            onChange={(e) => onChange({ ...value, topK: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Score mínimo</Label>
            <Badge variant="outline" className="font-mono text-meta">{value.minScore.toFixed(2)}</Badge>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[value.minScore]}
            onValueChange={([v]) => onChange({ ...value, minScore: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ------------- Integration -------------
type IntegrationExec = SkillExecution['integration'];

function IntegrationEditor({ value, onChange }: { value: IntegrationExec; onChange: (v: IntegrationExec) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Provider</Label>
        <Input
          value={value.provider}
          onChange={(e) => onChange({ ...value, provider: e.target.value })}
          placeholder="slack | hubspot | salesforce..."
          maxLength={60}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Evento</Label>
        <Input
          value={value.event}
          onChange={(e) => onChange({ ...value, event: e.target.value })}
          placeholder="message | contact.created..."
          maxLength={60}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Autenticação</Label>
        <Select
          value={value.authType}
          onValueChange={(v) => onChange({ ...value, authType: v as IntegrationExec['authType'] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
            <SelectItem value="apikey">API Key</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
