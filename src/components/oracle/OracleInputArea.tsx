import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, Settings2, Cpu, Brain, ChevronRight, XCircle, ShieldCheck, RotateCcw, AlertTriangle
} from 'lucide-react';
import { useOracleStore, ORACLE_MODES, ORACLE_PRESETS } from '@/stores/oracleStore';
import { PresetSelector } from './PresetSelector';
import { toast } from 'sonner';

const CHAIRMAN_MODELS = [
  { value: 'openai/gpt-4o', label: 'GPT-4o (Otimizado)' },
  { value: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'meta-llama/llama-3.1-405b', label: 'Llama 3.1 405B' },
];

export function OracleInputArea() {
  const store = useOracleStore();
  const [showPresets, setShowPresets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentPreset = ORACLE_PRESETS.find((p) => p.id === store.selectedPreset);
  const modeConfig = ORACLE_MODES[store.mode];

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && store.isRunning) {
        store.cancelQuery();
        toast.info('Consulta cancelada');
      }
      if (e.key === 'Enter' && e.ctrlKey && !store.isRunning && store.query.trim()) {
        store.submitQuery();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.isRunning, store.query]);

  return (
    <Card className="p-8 bg-card border-border rounded-3xl shadow-sm relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/[0.02] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-700" />
      
      {/* Mode & Preset selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-3 px-4 py-2 rounded-xl bg-secondary/80 border border-border/60 hover:bg-secondary hover:border-primary/30 transition-all shadow-sm"
          >
            <span className="text-xl">{currentPreset?.icon || '🏛️'}</span>
            <span className="text-sm font-bold text-foreground uppercase tracking-tight">
              {currentPreset?.name.replace(/^[^\s]+\s/, '') || 'Conselho Executivo'}
            </span>
            {showPresets ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <div className="flex gap-2">
            <Badge variant="outline" className="h-7 rounded-lg bg-primary/5 text-primary border-primary/20 text-[10px] font-bold uppercase">
              {modeConfig.icon} {modeConfig.label}
            </Badge>
            <Badge variant="outline" className="h-7 rounded-lg bg-muted/50 text-muted-foreground border-border/50 text-[10px] font-bold uppercase">
              {currentPreset?.members.length || 3} Especialistas
            </Badge>
          </div>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
        >
          <Settings2 className="h-4 w-4" />
          Configurações
        </button>
      </div>

      {/* Preset selector (collapsible) */}
      {showPresets && (
        <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
          <PresetSelector
            selectedPreset={store.selectedPreset}
            onSelect={(id) => {
              store.setSelectedPreset(id);
              setShowPresets(false);
            }}
          />
        </div>
      )}

      {/* Advanced settings (collapsible) */}
      {showAdvanced && (
        <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
          <div className="p-6 rounded-2xl bg-secondary/30 border border-border/40 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="h-3 w-3" /> Chairman (Sintetizador)
                </Label>
                <Select value={store.chairmanModel} onValueChange={store.setChairmanModel}>
                  <SelectTrigger className="h-10 rounded-xl bg-card border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {CHAIRMAN_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs font-medium">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">Seleção do Presidente</Label>
                <Select
                  value={store.chairmanSelection}
                  onValueChange={(v) => store.setChairmanSelection(v as 'auto' | 'manual')}
                >
                  <SelectTrigger className="h-10 rounded-xl bg-card border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="auto" className="text-xs font-medium italic">🤖 Automática (por domínio)</SelectItem>
                    <SelectItem value="manual" className="text-xs font-medium">✋ Manual (fixo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="h-3 w-3" /> Guardrails (Políticas do Conselho)
              </Label>
              <Textarea
                placeholder="Ex: Não use termos técnicos excessivos. Sempre apresente riscos financeiros."
                value={store.customGuardrails}
                onChange={(e) => store.setCustomGuardrails(e.target.value)}
                className="min-h-[80px] bg-card border-border/60 rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-card/40 rounded-xl border border-border/30">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-foreground">💭 Modo Raciocínio (Thinking)</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Exibe a cadeia de pensamento completa de cada membro do conselho
                  </p>
                </div>
              </div>
              <Switch checked={store.enableThinking} onCheckedChange={store.setEnableThinking} />
            </div>
          </div>
        </div>
      )}

      {/* Query input */}
      <div className="relative">
        <Textarea
          placeholder="Qual decisão complexa o conselho deve analisar hoje?"
          value={store.query}
          onChange={(e) => store.setQuery(e.target.value)}
          className="min-h-[140px] bg-secondary/40 border-border/60 rounded-2xl p-6 text-base focus:ring-primary focus:border-primary transition-all shadow-inner placeholder:italic"
        />
        {store.query.length > 0 && (
          <div className="absolute bottom-4 right-4 text-[10px] font-mono text-muted-foreground bg-card px-2 py-0.5 rounded border border-border/40">
            {store.query.length} caracteres
          </div>
        )}
      </div>

      {/* Progress and status alerts */}
      {store.isRunning && (
        <div className="mt-4 px-2 flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{store.stageLabel}</span>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase font-bold">Pressione ESC para cancelar</span>
        </div>
      )}

      {store.error && !store.isRunning && (
        <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-xs text-destructive font-medium">{store.error}</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-[10px] font-bold uppercase gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={() => store.submitQuery()}
          >
            <RotateCcw className="h-3 w-3" /> Tentar Novamente
          </Button>
        </div>
      )}

      {/* Submit */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          {modeConfig.stages.map((stage, idx) => (
            <div key={stage} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">{stage}</span>
              {idx < modeConfig.stages.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={store.submitQuery}
            disabled={store.isRunning || !store.query.trim()}
            className="nexus-gradient-bg text-primary-foreground gap-3 h-12 px-8 rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all font-bold group"
          >
            {store.isRunning ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            )}
            {store.isRunning ? (store.isReplaying ? 'Rodando Replay...' : 'Conselho em Sessão...') : 'CONVOCAR CONSELHO'}
          </Button>
          {store.isRunning && !store.isReplaying && (
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-xl border-destructive/20 text-destructive hover:bg-destructive/10"
              onClick={store.cancelQuery}
            >
              <XCircle className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}