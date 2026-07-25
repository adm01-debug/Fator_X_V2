/**
 * CostCalculatorPanel — Interactive LLM cost calculator.
 * Wires costCalculatorService into BillingPage.
 */
import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, ArrowUpDown, DollarSign, Loader2 } from 'lucide-react';
import { getAllPricing, calculateCost, formatCostUsd, formatCostBrl, compareCosts, type ActualCost, type ModelPricing } from '@/services/costCalculatorService';
import { Button } from '@/components/ui/button';

export function CostCalculatorPanel() {
  const [allPricing, setAllPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    getAllPricing().then(data => {
      setAllPricing(data);
      setLoading(false);
    });
  }, []);

  const providers = useMemo(() => [...new Set(allPricing.map(p => p.provider))], [allPricing]);

  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('');
  const [inputTokens, setInputTokens] = useState('1000');
  const [outputTokens, setOutputTokens] = useState('500');
  const [result, setResult] = useState<ActualCost | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparison, setComparison] = useState<Array<{ provider: string; model: string; costUsd: number; costBrl: number }>>([]);
  const [comparing, setComparing] = useState(false);

  const modelsForProvider = useMemo(
    () => allPricing.filter(p => p.provider === provider),
    [allPricing, provider]
  );

  // Sync provider/model when data loads
  useEffect(() => {
    if (providers.length > 0 && !provider) {
      setProvider(providers[0]);
    }
  }, [providers, provider]);

  const handleCalculate = async () => {
    const inp = parseInt(inputTokens) || 0;
    const out = parseInt(outputTokens) || 0;
    const m = model || modelsForProvider[0]?.model || '';
    if (!m) return;
    
    setCalculating(true);
    try {
      const cost = await calculateCost(provider, m, inp, out);
      setResult(cost);
    } catch { /* ignore */ }
    setCalculating(false);
  };

  const toggleComparison = async () => {
    if (!showComparison) {
      setComparing(true);
      const inp = parseInt(inputTokens) || 1000;
      const out = parseInt(outputTokens) || 500;
      try {
        const results = await compareCosts(inp, out);
        setComparison(results);
        setShowComparison(true);
      } catch { /* ignore */ }
      setComparing(false);
    } else {
      setShowComparison(false);
    }
  };

  if (loading) {
    return (
      <div className="nexus-card h-40 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="nexus-card space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-nexus-amber/10 flex items-center justify-center">
          <Calculator className="h-4 w-4 text-nexus-amber" />
        </div>
        <div>
          <h3 className="text-body-sm font-bold text-foreground">Calculadora de Custos LLM</h3>
          <p className="text-meta text-muted-foreground">{allPricing.length} modelos · {providers.length} providers · Fonte: Central de Preços Nexus</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="space-y-1">
          <label htmlFor="cost-calc-provider" className="text-[10px] font-medium text-muted-foreground uppercase">Provider</label>
          <Select value={provider} onValueChange={v => { setProvider(v); setModel(''); }}>
            <SelectTrigger id="cost-calc-provider" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {providers.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cost-calc-model" className="text-[10px] font-medium text-muted-foreground uppercase">Modelo</label>
          <Select value={model || modelsForProvider[0]?.model || ''} onValueChange={setModel}>
            <SelectTrigger id="cost-calc-model" className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {modelsForProvider.map(m => <SelectItem key={m.model} value={m.model}>{m.model}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cost-calc-input-tokens" className="text-[10px] font-medium text-muted-foreground uppercase">Tokens Input</label>
          <Input id="cost-calc-input-tokens" className="h-8 text-xs" type="number" value={inputTokens} onChange={e => setInputTokens(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cost-calc-output-tokens" className="text-[10px] font-medium text-muted-foreground uppercase">Tokens Output</label>
          <Input id="cost-calc-output-tokens" className="h-8 text-xs" type="number" value={outputTokens} onChange={e => setOutputTokens(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5 text-meta" onClick={handleCalculate} disabled={calculating}>
          {calculating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />} 
          Calcular
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-meta" onClick={toggleComparison} disabled={comparing}>
          {comparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          {showComparison ? 'Ocultar' : 'Comparar'} Todos
        </Button>
      </div>

      {result && (
        <div className="grid grid-cols-3 gap-2.5 animate-fade-in">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <p className="text-title-sm font-black text-foreground">{formatCostUsd(result.totalCostUsd)}</p>
            <p className="text-meta text-muted-foreground">Custo USD</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <p className="text-title-sm font-black text-foreground">{formatCostBrl(result.totalCostUsd)}</p>
            <p className="text-meta text-muted-foreground">Custo BRL</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
            <p className="text-title-sm font-black text-foreground">{result.totalTokens.toLocaleString()}</p>
            <p className="text-meta text-muted-foreground">Total Tokens</p>
          </div>
        </div>
      )}

      {showComparison && comparison.length > 0 && (
        <div className="animate-fade-in">
          <p className="text-meta font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Comparação de {comparison.length} modelos</p>
          <div className="space-y-1 max-h-[250px] overflow-auto">
            {comparison.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-1.5">
                <span className="text-meta text-muted-foreground w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-meta font-medium truncate">{c.model}</p>
                </div>
                <Badge variant="outline" className="text-meta">{formatCostUsd(c.costUsd)}</Badge>
                <span className="text-meta text-muted-foreground">{formatCostBrl(c.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
