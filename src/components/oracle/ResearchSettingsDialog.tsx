/**
 * ResearchSettingsDialog — Tela de configuração do Deep Research.
 * Permite definir iterações, estratégia de busca, modelo de síntese e limites.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Settings2, RotateCcw, Save, AlertTriangle, Zap, Compass, Target, Brain, Globe2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  useResearchConfig, DEFAULT_RESEARCH_CONFIG,
  type ResearchConfig, type ResearchDepth, type SearchStrategy, type SynthesisModel, type Language,
} from '@/lib/researchConfig';

interface Props {
  trigger?: React.ReactNode;
}

const STRATEGY_META: Record<SearchStrategy, { label: string; icon: typeof Compass; hint: string }> = {
  broad:    { label: 'Ampla',       icon: Globe2,  hint: 'Explora múltiplos ângulos por iteração; consome mais tokens.' },
  balanced: { label: 'Equilibrada', icon: Compass, hint: 'Combina cobertura com profundidade. Recomendado.' },
  focused:  { label: 'Focada',      icon: Target,  hint: 'Aprofunda o gap prioritário; mais rápida, menor cobertura.' },
};

const MODEL_LABELS: Record<SynthesisModel, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6 (recomendado)',
  'claude-opus-4-8':   'Claude Opus 4.8 (alta qualidade)',
  'gpt-5-large':       'GPT-5 Large',
  'gemini-2-5-pro':    'Gemini 2.5 Pro',
};

export function ResearchSettingsDialog({ trigger }: Props) {
  const [saved, updateSaved] = useResearchConfig();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ResearchConfig>(saved);

  const set = <K extends keyof ResearchConfig>(k: K, v: ResearchConfig[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const handleOpenChange = (o: boolean) => {
    if (o) setDraft(saved);
    setOpen(o);
  };

  const handleSave = () => {
    if (draft.maxIterations < 1 || draft.maxIterations > 10) {
      toast.error('Iterações devem estar entre 1 e 10');
      return;
    }
    if (draft.queriesPerIteration < 1 || draft.queriesPerIteration > 5) {
      toast.error('Queries por iteração devem estar entre 1 e 5');
      return;
    }
    if (draft.maxCostUsd <= 0 || draft.maxCostUsd > 50) {
      toast.error('Custo máximo deve estar entre 0.01 e 50 USD');
      return;
    }
    updateSaved(draft);
    toast.success('Configuração salva');
    setOpen(false);
  };

  const handleReset = () => {
    setDraft(DEFAULT_RESEARCH_CONFIG);
    toast.info('Configuração restaurada aos padrões');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2 h-9 rounded-xl">
            <Settings2 className="h-4 w-4" /> Configurar
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-title-sm">
            <Settings2 className="h-5 w-5 text-primary" /> Configuração do Deep Research
          </DialogTitle>
          <DialogDescription>
            Ajuste iterações, estratégia de busca, modelo de síntese e limites de execução. As alterações são persistidas neste dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* Perfil padrão de profundidade */}
          <section className="space-y-2">
            <Label className="text-body-sm font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Profundidade padrão
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['quick', 'standard', 'deep'] as ResearchDepth[]).map(d => (
                <button
                  key={d}
                  onClick={() => set('defaultDepth', d)}
                  className={`px-3 py-2.5 text-meta font-bold rounded-lg uppercase tracking-widest border transition-all ${
                    draft.defaultDepth === d
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-secondary/40 text-muted-foreground border-border/50 hover:text-foreground'
                  }`}
                >
                  {d === 'quick' ? '⚡ Rápido' : d === 'standard' ? '📊 Padrão' : '🔬 Profundo'}
                </button>
              ))}
            </div>
            <p className="text-meta text-muted-foreground">Perfil pré-selecionado ao abrir o Deep Research.</p>
          </section>

          {/* Iterações e queries */}
          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-body-sm font-bold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Máximo de iterações
                </Label>
                <Badge variant="outline" className="font-mono">{draft.maxIterations}</Badge>
              </div>
              <Slider
                value={[draft.maxIterations]}
                onValueChange={([v]) => set('maxIterations', v)}
                min={1} max={10} step={1}
              />
              <p className="text-meta text-muted-foreground">Cada iteração roda um ciclo buscar → analisar → identificar gaps.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-body-sm font-bold">Queries geradas por iteração</Label>
                <Badge variant="outline" className="font-mono">{draft.queriesPerIteration}</Badge>
              </div>
              <Slider
                value={[draft.queriesPerIteration]}
                onValueChange={([v]) => set('queriesPerIteration', v)}
                min={1} max={5} step={1}
              />
            </div>
          </section>

          {/* Estratégia de busca */}
          <section className="space-y-2">
            <Label className="text-body-sm font-bold flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" /> Estratégia de busca
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(STRATEGY_META) as SearchStrategy[]).map(s => {
                const meta = STRATEGY_META[s];
                const Icon = meta.icon;
                const active = draft.strategy === s;
                return (
                  <button
                    key={s}
                    onClick={() => set('strategy', s)}
                    className={`p-3 text-left rounded-xl border transition-all ${
                      active
                        ? 'bg-primary/10 border-primary/40 shadow-sm'
                        : 'bg-secondary/30 border-border/50 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-body-sm font-bold text-foreground">{meta.label}</span>
                    </div>
                    <p className="text-meta text-muted-foreground leading-relaxed">{meta.hint}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Modelo e idioma */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-body-sm font-bold flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" /> Modelo de síntese
              </Label>
              <Select value={draft.synthesisModel} onValueChange={v => set('synthesisModel', v as SynthesisModel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODEL_LABELS) as SynthesisModel[]).map(m => (
                    <SelectItem key={m} value={m}>{MODEL_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-body-sm font-bold">Idioma do relatório</Label>
              <Select value={draft.language} onValueChange={v => set('language', v as Language)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt">Português (BR)</SelectItem>
                  <SelectItem value="en">Inglês</SelectItem>
                  <SelectItem value="es">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Limites */}
          <section className="space-y-3">
            <Label className="text-body-sm font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-nexus-amber" /> Limites de execução
            </Label>
            <Card className="p-4 rounded-xl bg-secondary/30 border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="maxTokens" className="text-meta text-muted-foreground uppercase tracking-widest">Máx. tokens</Label>
                <Input
                  id="maxTokens" type="number" min={1000} max={500_000} step={1000}
                  value={draft.maxTokens}
                  onChange={e => set('maxTokens', Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxSources" className="text-meta text-muted-foreground uppercase tracking-widest">Máx. fontes</Label>
                <Input
                  id="maxSources" type="number" min={5} max={50} step={1}
                  value={draft.maxSources}
                  onChange={e => set('maxSources', Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxLatency" className="text-meta text-muted-foreground uppercase tracking-widest">Latência máx. (s)</Label>
                <Input
                  id="maxLatency" type="number" min={30} max={600} step={10}
                  value={draft.maxLatencySec}
                  onChange={e => set('maxLatencySec', Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxCost" className="text-meta text-muted-foreground uppercase tracking-widest">Custo máx. (USD)</Label>
                <Input
                  id="maxCost" type="number" min={0.1} max={50} step={0.1}
                  value={draft.maxCostUsd}
                  onChange={e => set('maxCostUsd', Number(e.target.value) || 0)}
                />
              </div>
            </Card>
          </section>

          {/* Toggles */}
          <section className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
              <div>
                <Label className="text-body-sm font-bold">Encerrar ao esgotar gaps</Label>
                <p className="text-meta text-muted-foreground">Interrompe iterações quando nenhum gap é identificado.</p>
              </div>
              <Switch checked={draft.stopOnNoGaps} onCheckedChange={v => set('stopOnNoGaps', v)} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
              <div>
                <Label className="text-body-sm font-bold">Incluir base de conhecimento interna</Label>
                <p className="text-meta text-muted-foreground">Usa também documentos indexados do workspace na síntese.</p>
              </div>
              <Switch checked={draft.includeInternal} onCheckedChange={v => set('includeInternal', v)} />
            </div>
          </section>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="nexus-gradient-bg gap-2 font-bold">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
