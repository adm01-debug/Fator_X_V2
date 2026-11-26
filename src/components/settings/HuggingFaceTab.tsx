import { useEffect, useState } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useWorkspaceId } from '@/hooks/use-data';
import { useHfConfig, useSaveHfConfig } from '@/hooks/useHfConfig';
import { useRBAC } from '@/hooks/useRBAC';
import {
  HF_CONFIG_DEFAULTS,
  HF_MODEL_FIELDS,
  HF_TOGGLE_FIELDS,
  type HfConfig,
  type HfToggleKey,
} from '@/services/hfConfigService';

const FEATURES: {
  name: string;
  desc: string;
  toggle?: HfToggleKey;
  status: 'active' | 'available';
}[] = [
  {
    name: 'Injection Detection ML',
    desc: 'ProtectAI deberta-v3 · Detecta prompt injection antes do modelo',
    toggle: 'enable_ml_injection',
    status: 'active',
  },
  {
    name: 'RAG Reranker',
    desc: 'BAAI/bge-reranker-v2-m3 · Cross-encoder multilingual gratuito',
    toggle: 'enable_hf_reranker',
    status: 'active',
  },
  { name: 'Auto-Classificação de Traces', desc: 'xlm-roberta-large-xnli · 8 categorias zero-shot em PT', status: 'active' },
  { name: 'NER no Super Cérebro', desc: 'bert-base-NER · Extração de entidades 10x mais rápida', status: 'active' },
  { name: 'Sentiment Analysis (WhatsApp)', desc: 'twitter-roberta-base-sentiment · Análise de sentimento no DataHub', status: 'active' },
  { name: 'LLM Provider (Inference API)', desc: 'Qwen3, Mistral Small, Llama 4 Scout · Modelos gratuitos no Agent Builder', status: 'active' },
  { name: 'Fine-tuning (AutoTrain)', desc: 'Treine modelos custom com dados dos seus agentes', status: 'available' },
];

export function HuggingFaceTab() {
  const { data: workspaceId } = useWorkspaceId();
  const { isAdmin } = useRBAC();
  const { data: config, isLoading, isError } = useHfConfig(workspaceId ?? undefined);
  const saveConfig = useSaveHfConfig(workspaceId ?? undefined);

  const [draft, setDraft] = useState<HfConfig>(HF_CONFIG_DEFAULTS);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const dirty =
    !!config && (Object.keys(draft) as (keyof HfConfig)[]).some((key) => draft[key] !== config[key]);

  const statusOf = (feature: (typeof FEATURES)[number]) => {
    if (feature.status === 'available') return 'Disponível';
    if (feature.toggle && !draft[feature.toggle]) return 'Desativado';
    return 'Ativo';
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-nexus-amber" />
          <h3 className="font-semibold">HuggingFace Integration</h3>
        </div>
        <p className="text-body-sm text-muted-foreground">
          Modelos open-source gratuitos para guardrails, RAG, classificação e inferência.
          Configure o token HF na aba API Keys com o nome{' '}
          <code className="text-meta bg-muted px-1 py-0.5 rounded">huggingface_api_key</code>.
        </p>

        <div className="pt-3 border-t space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-body-sm font-medium">Configuração deste workspace</h4>
              <p className="text-meta text-muted-foreground">
                Vale para todas as chamadas do workspace, acima dos defaults do sistema.
                {!isAdmin && ' Somente administradores do workspace podem alterar.'}
              </p>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {isError && (
            <p className="text-meta text-nexus-rose">
              Não foi possível ler a configuração salva — os valores abaixo são os padrões do
              sistema.
            </p>
          )}
          {!isLoading && !isError && !config && (
            <p className="text-meta text-muted-foreground">
              Nenhuma configuração salva ainda: o workspace usa os padrões do sistema. Salve para
              criar a sua.
            </p>
          )}

          <div className="space-y-3">
            {HF_TOGGLE_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50"
              >
                <div>
                  <Label htmlFor={`hf-${field.key}`} className="text-body-sm font-medium">
                    {field.label}
                  </Label>
                  <p className="text-meta text-muted-foreground">{field.description}</p>
                  <p className="text-meta text-nexus-cyan">{field.effect}</p>
                </div>
                <Switch
                  id={`hf-${field.key}`}
                  checked={draft[field.key]}
                  disabled={!isAdmin}
                  onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, [field.key]: checked }))}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {HF_MODEL_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`hf-${field.key}`} className="text-body-sm font-medium">
                  {field.label}
                </Label>
                <Input
                  id={`hf-${field.key}`}
                  value={draft[field.key]}
                  disabled={!isAdmin}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  placeholder={HF_CONFIG_DEFAULTS[field.key]}
                />
                <p className="text-meta text-muted-foreground">{field.effect}</p>
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!workspaceId || !dirty || saveConfig.isPending}
                onClick={() => saveConfig.mutate(draft)}
              >
                {saveConfig.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar configuração
              </Button>
              {dirty && <span className="text-meta text-muted-foreground">Alterações não salvas</span>}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-3">
          <h4 className="text-body-sm font-medium">Funcionalidades</h4>
          <div className="grid gap-3">
            {FEATURES.map((f) => (
              <div key={f.name} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="text-body-sm font-medium">{f.name}</p>
                  <p className="text-meta text-muted-foreground">{f.desc}</p>
                </div>
                <span
                  className={`text-meta px-2 py-0.5 rounded ${
                    f.status === 'available' || (f.toggle && !draft[f.toggle])
                      ? 'bg-primary/12 text-primary'
                      : 'bg-nexus-emerald/12 text-nexus-emerald'
                  }`}
                >
                  {statusOf(f)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="pt-3 border-t space-y-2">
          <h4 className="text-body-sm font-medium">Self-Hosted (TEI)</h4>
          <p className="text-meta text-muted-foreground">
            Para alto volume, deploy TEI localmente com GPU. Configure os endpoints nas env vars
            <code className="bg-muted px-1 py-0.5 rounded ml-1">HF_TEI_ENDPOINT</code> e
            <code className="bg-muted px-1 py-0.5 rounded ml-1">HF_TEI_RERANK_ENDPOINT</code>.
          </p>
          <div className="bg-muted/30 p-3 rounded text-meta font-mono text-muted-foreground whitespace-pre-wrap">
{`docker run -p 8080:80 \\
  ghcr.io/huggingface/tei:latest \\
  --model-id BAAI/bge-reranker-v2-m3`}
          </div>
        </div>
      </div>
    </div>
  );
}
