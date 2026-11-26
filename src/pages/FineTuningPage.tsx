import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/PageHeader';
import { toast } from 'sonner';
import {
  getJobStatus,
  listFineTuneJobs,
  listTrainingJobs,
  prepareDataset,
  recordFineTuneJob,
  startTraining,
  syncFineTuneJob,
  type FineTuneJobRecord,
  type TaskType,
  type TrainingMethod,
} from '@/services/fineTuningService';
import { logger } from '@/lib/logger';

const BASE_MODELS: Record<string, string> = {
  llama: 'meta-llama/Llama-3.1-8B-Instruct',
  mistral: 'mistralai/Mistral-7B-v0.3',
  qwen: 'Qwen/Qwen2.5-7B-Instruct',
  gemma: 'google/gemma-2-9b',
};

const ACTIVE_STATUSES = new Set(['pending', 'queued', 'running', 'training']);

type TrainingJob = Awaited<ReturnType<typeof listTrainingJobs>>['jobs'][number];

function statusBadge(status: string) {
  if (status === 'completed' || status === 'succeeded') {
    return (
      <Badge className="bg-nexus-green/15 text-nexus-green text-meta">
        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
        Pronto
      </Badge>
    );
  }
  if (status === 'failed' || status === 'error') {
    return (
      <Badge className="bg-destructive/15 text-destructive text-meta">
        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
        Falhou
      </Badge>
    );
  }
  if (ACTIVE_STATUSES.has(status)) {
    return (
      <Badge className="bg-nexus-blue/15 text-nexus-blue text-meta">
        {status === 'pending' || status === 'queued' ? 'Na fila' : 'Treinando'}
      </Badge>
    );
  }
  if (status === 'unknown') {
    return (
      <Badge variant="secondary" className="text-meta">
        Sem dados
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-meta">
      {status}
    </Badge>
  );
}

export default function FineTuningPage() {
  const [name, setName] = useState('');
  const [baseModel, setBaseModel] = useState('llama');
  const [method, setMethod] = useState('lora');
  const [rank, setRank] = useState([16]);
  const [epochs, setEpochs] = useState([3]);
  const [lr, setLr] = useState([2]);
  const [agentId, setAgentId] = useState('');
  const [samplesCount, setSamplesCount] = useState<number | null>(null);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<FineTuneJobRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    // As duas fontes falham de forma independente: o Hub pode estar fora sem derrubar o
    // histórico local, e vice-versa.
    await Promise.all([
      (async () => {
        try {
          const data = await listTrainingJobs();
          setJobs(data.jobs ?? []);
          setLoadError(null);
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : 'Falha ao listar os jobs');
        }
      })(),
      (async () => {
        try {
          setHistory(await listFineTuneJobs());
          setHistoryError(null);
        } catch (err) {
          setHistoryError(
            err instanceof Error ? err.message : 'Falha ao ler o histórico do workspace',
          );
        }
      })(),
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const activeIds = jobs
    .filter((j) => ACTIVE_STATUSES.has(j.status))
    .map((j) => j.job_id)
    .join(',');

  useEffect(() => {
    if (!activeIds) return;
    const ids = activeIds.split(',');
    const timer = setInterval(() => {
      void (async () => {
        const updates = await Promise.all(
          ids.map(async (id) => {
            try {
              return await getJobStatus(id);
            } catch {
              return null;
            }
          }),
        );
        const fresh = updates.filter((u): u is NonNullable<typeof u> => u !== null);
        if (fresh.length === 0) return;
        // check_status só devolve status/arquivos: preserva os metadados vindos de list_jobs.
        setJobs((prev) =>
          prev.map((j) => ({ ...j, ...(fresh.find((f) => f.job_id === j.job_id) ?? {}) })),
        );
        // Leva o status novo para o registro local (`finetune_jobs`), que é o que sobrevive
        // a uma falha do Hub. Job sem registro local apenas devolve null.
        await Promise.all(
          fresh.map((f) =>
            syncFineTuneJob({
              hfRepoId: f.hub_repo ?? f.job_id,
              statusRaw: f.status,
              resultModelId: f.gateway_model_id ?? null,
            }).catch((err: unknown) =>
              logger.warn(
                `syncFineTuneJob falhou: ${err instanceof Error ? err.message : String(err)}`,
              ),
            ),
          ),
        );
        setHistory(await listFineTuneJobs().catch(() => []));
      })();
    }, 15000);
    return () => clearInterval(timer);
  }, [activeIds]);

  const handleStart = async () => {
    const repoName = name.trim();
    if (!repoName) {
      toast.error('Informe o nome do modelo que sera publicado no Hugging Face');
      return;
    }
    setSubmitting(true);
    try {
      const result = await startTraining({
        base_model: BASE_MODELS[baseModel] ?? baseModel,
        task: 'text-generation' as TaskType,
        epochs: epochs[0],
        learning_rate: lr[0] * 1e-4,
        repo_name: repoName,
        method: method as TrainingMethod,
        ...(method !== 'full' ? { lora_rank: rank[0] } : {}),
      });
      toast.success(
        result.job_id ? `Treinamento iniciado: ${result.job_id}` : 'Treinamento iniciado',
      );
      try {
        const baseModelId = BASE_MODELS[baseModel] ?? baseModel;
        await recordFineTuneJob({
          hfRepoId: result.repo_url?.replace('https://huggingface.co/', '') ?? repoName,
          hfModelUrl: result.repo_url ?? null,
          baseModel: baseModelId,
          task: 'text-generation' as TaskType,
          agentId: agentId.trim() || null,
          config: {
            epochs: epochs[0],
            learning_rate: lr[0] * 1e-4,
            method,
            ...(method !== 'full' ? { lora_rank: rank[0] } : {}),
          },
        });
      } catch (err) {
        // O treino já começou no Hub: falhar aqui não pode virar erro para o usuário.
        logger.warn(
          `Falha ao registrar o job em finetune_jobs: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao iniciar o treinamento');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrepareDataset = async () => {
    const id = agentId.trim();
    if (!id) {
      toast.error('Informe o ID do agente de onde as traces serao extraidas');
      return;
    }
    setPreparing(true);
    try {
      const result = await prepareDataset(id, {
        source: 'traces',
        min_quality_score: 0.7,
        max_samples: 500,
        task_type: 'text-generation',
      });
      setSamplesCount(result.samples_count ?? 0);
      toast.success('Dataset preparado a partir das traces do agente');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao preparar o dataset');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Fine-Tuning No-Code"
        description="Treine modelos customizados com LoRA, QLoRA ou Full Fine-Tuning. Sem codigo, sem GPU local."
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-body-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Novo treinamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ft-name" className="text-meta">
                  Nome
                </Label>
                <Input
                  id="ft-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-bot-v1"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ft-base-model" className="text-meta">
                  Modelo base
                </Label>
                <Select value={baseModel} onValueChange={setBaseModel}>
                  <SelectTrigger id="ft-base-model" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llama">Llama 3.1 8B</SelectItem>
                    <SelectItem value="mistral">Mistral 7B v0.3</SelectItem>
                    <SelectItem value="qwen">Qwen 2.5 7B</SelectItem>
                    <SelectItem value="gemma">Gemma 2 9B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="ft-agent" className="text-meta">
                Dataset
              </Label>
              <div className="mt-1 border-2 border-dashed border-border/50 rounded-md p-4 space-y-3">
                <div className="flex items-center gap-2 text-body-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Extrair das traces do agente
                </div>
                <div className="flex gap-2">
                  <Input
                    id="ft-agent"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="ID do agente"
                  />
                  <Button variant="outline" onClick={handlePrepareDataset} disabled={preparing}>
                    {preparing ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Preparar dataset
                  </Button>
                </div>
                <div className="text-meta text-muted-foreground">
                  {samplesCount === null
                    ? 'Qualidade minima 0.7 - ate 500 exemplos'
                    : `${samplesCount} exemplos prontos a partir das traces`}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-meta mb-2 block">Metodo</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'lora', name: 'LoRA', desc: 'Rapido' },
                  { id: 'qlora', name: 'QLoRA', desc: '4-bit' },
                  { id: 'full', name: 'Full FT', desc: 'Maxima qualidade' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    className={`p-2.5 rounded-md border text-left transition-all ${method === m.id ? 'border-primary bg-primary/8' : 'border-border/40'}`}
                  >
                    <div className="text-body-sm font-semibold">{m.name}</div>
                    <div className="text-meta text-muted-foreground mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {method !== 'full' && (
              <div>
                <div className="flex justify-between text-meta mb-1.5">
                  <Label>LoRA rank</Label>
                  <span className="font-mono">{rank[0]}</span>
                </div>
                <Slider value={rank} onValueChange={setRank} min={4} max={64} step={4} />
              </div>
            )}
            <div>
              <div className="flex justify-between text-meta mb-1.5">
                <Label>Epochs</Label>
                <span className="font-mono">{epochs[0]}</span>
              </div>
              <Slider value={epochs} onValueChange={setEpochs} min={1} max={10} step={1} />
            </div>
            <div>
              <div className="flex justify-between text-meta mb-1.5">
                <Label>Learning rate</Label>
                <span className="font-mono">{lr[0]}e-4</span>
              </div>
              <Slider value={lr} onValueChange={setLr} min={1} max={10} step={1} />
            </div>
            <div className="p-3 bg-muted/30 rounded text-meta space-y-1">
              <div className="flex justify-between gap-3">
                <span>Modelo enviado</span>
                <span className="font-mono truncate">{BASE_MODELS[baseModel]}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Metodo e hiperparametros</span>
                <span className="font-mono">
                  {method}
                  {method !== 'full' ? ` r=${rank[0]}` : ''} - {epochs[0]} ep - {lr[0]}e-4
                </span>
              </div>
            </div>
            <Button className="w-full" onClick={handleStart} disabled={submitting}>
              {submitting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Iniciar fine-tuning
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-body-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Jobs
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadJobs()}
                disabled={loading}
                aria-label="Atualizar jobs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <div className="text-meta text-muted-foreground">Carregando jobs...</div>}
            {!loading && loadError && (
              <div role="alert" className="text-meta text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                {loadError}
              </div>
            )}
            {!loading && !loadError && jobs.length === 0 && (
              <div className="text-meta text-muted-foreground">Nenhum treinamento ainda.</div>
            )}
            {jobs.map((j) => (
              <div key={j.job_id} className="p-3 bg-muted/20 rounded-md space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold truncate">
                      {j.hub_repo ?? j.job_id}
                    </div>
                    <div className="text-meta text-muted-foreground truncate font-mono">
                      {j.job_id}
                    </div>
                  </div>
                  {statusBadge(j.status)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-muted-foreground font-mono">
                  {j.base_model && <span>{j.base_model.split('/').pop()}</span>}
                  {j.method && (
                    <span>
                      {j.method}
                      {j.lora_rank ? ` r=${j.lora_rank}` : ''}
                    </span>
                  )}
                  {j.created_at && (
                    <span>{new Date(j.created_at).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
                <div className="text-meta text-muted-foreground">
                  {j.has_model_files
                    ? 'Pesos do modelo publicados no repositorio'
                    : 'Aguardando o upload dos pesos treinados'}
                </div>
                {j.gateway_model_id && (
                  <div className="text-meta text-muted-foreground">
                    Usar como <span className="font-mono">{j.gateway_model_id}</span> no LLM Gateway
                  </div>
                )}
                {j.hub_repo && (
                  <a
                    href={`https://huggingface.co/${j.hub_repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-meta text-primary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver no Hugging Face
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-body-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              Histórico do workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-meta text-muted-foreground">
              Registro local de cada treinamento iniciado aqui — continua visível mesmo se o
              Hugging Face não responder.
            </p>
            {historyError && (
              <div role="alert" className="text-meta text-destructive flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
                {historyError}
              </div>
            )}
            {!historyError && history.length === 0 && (
              <div className="text-meta text-muted-foreground">Nenhum job registrado ainda.</div>
            )}
            {history.map((r) => (
              <div key={r.id} className="p-3 bg-muted/20 rounded-md space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={r.hf_model_url ?? `https://huggingface.co/${r.hf_repo_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body-sm font-semibold truncate text-primary inline-flex items-center gap-1"
                  >
                    {r.hf_repo_id}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {statusBadge(r.status)}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-muted-foreground font-mono">
                  <span>{r.base_model.split('/').pop()}</span>
                  <span>{new Date(r.created_at).toLocaleString('pt-BR')}</span>
                  {r.result_model_id && <span>{r.result_model_id}</span>}
                </div>
                {r.error && <div className="text-meta text-destructive">{r.error}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
