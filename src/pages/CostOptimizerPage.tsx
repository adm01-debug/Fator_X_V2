import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingDown, DollarSign, Zap, Lightbulb, ArrowDown, PieChart, Wallet, ShieldCheck, Sparkles, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { getDashboardMetrics } from "@/services/monitoringService";
import { getAllPricing } from "@/services/costCalculatorService";
import { cn } from "@/lib/utils";

interface Recommendation {
  id: string;
  title: string;
  description: string;
  savings: number;
  impact: "high" | "medium" | "low";
  applied: boolean;
}

const recs: Recommendation[] = [
  { id: "r1", title: "Trocar GPT-5 por GPT-5-mini em SDR Bot", description: "Tarefa simples de classificação, mini atinge 96% da qualidade por 1/10 do preço.", savings: 412.50, impact: "high", applied: false },
  { id: "r2", title: "Habilitar prompt caching no Oráculo", description: "85% das queries de deliberação têm contexto de sistema repetido.", savings: 287.20, impact: "high", applied: false },
  { id: "r3", title: "Reduzir max_tokens de 4k → 1k em classificação", description: "Outputs raramente passam de 200 tokens. Corte de desperdício preventivo.", savings: 124.80, impact: "medium", applied: true },
  { id: "r4", title: "Usar Gemini Flash Lite em pre-filter", description: "10x mais barato que Pro, suficiente para gates iniciais de roteamento.", savings: 198.40, impact: "high", applied: false },
  { id: "r5", title: "Batch embeddings em vez de single calls", description: "Reduz overhead de rede e latência de processamento em 40% no ingest.", savings: 67.30, impact: "low", applied: false },
];

export default function CostOptimizerPage() {
  const { data: metrics } = useQuery({
    queryKey: ['dashboard-metrics-finops'],
    queryFn: getDashboardMetrics,
  });

  const pricing = getAllPricing();
  const totalSavings = recs.filter(r => !r.applied).reduce((s, r) => s + r.savings, 0);
  const monthlySpend = 3247.80;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* FinOps Industrial Header */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-nexus-emerald/5 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-nexus-emerald/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-nexus-emerald/20 to-nexus-emerald/5 flex items-center justify-center border border-nexus-emerald/20 shadow-2xl shadow-nexus-emerald/10 group-hover:scale-105 transition-transform duration-500">
              <TrendingDown className="h-11 w-11 text-nexus-emerald animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Cost Optimizer</h1>
                <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-none font-black px-3 py-1 rounded-full text-[10px] tracking-widest uppercase">FinOps Neural</Badge>
              </div>
              <p className="text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                Maximização de eficiência cognitiva. Recomendações automáticas baseadas em padrões reais de consumo e qualidade de modelos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <Button className="h-12 px-8 rounded-2xl font-bold nexus-gradient-bg text-primary-foreground shadow-xl shadow-primary/20" onClick={() => toast.success("Audit de Custos disparado")}>
               <Sparkles className="h-5 w-5 mr-2" />
               Deep Audit AI
             </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FinOpsMetricCard label="Monthly Spend" value={`$${monthlySpend.toFixed(2)}`} icon={Wallet} subLabel="Last 30 days" />
        <FinOpsMetricCard label="Potential Savings" value={`$${totalSavings.toFixed(2)}`} icon={ArrowDown} subLabel="Unapplied recs" color="text-nexus-emerald" trend="-28%" />
        <FinOpsMetricCard label="Efficiency Score" value="7.2/10" icon={Zap} subLabel="Model Alignment" color="text-primary" />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-border/40 rounded-[2rem] overflow-hidden bg-card/50 backdrop-blur-xl shadow-sm">
            <CardHeader className="p-8 border-b bg-muted/20 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <Lightbulb className="h-5 w-5 text-nexus-amber" /> Neural Recommendations
                </CardTitle>
                <CardDescription className="text-xs uppercase tracking-widest font-black mt-1">Atualizado em tempo real via telemetria Nexus</CardDescription>
              </div>
              <Badge variant="outline" className="border-border/60">{recs.length} Oportunidades</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {recs.map(r => (
                  <div key={r.id} className={cn(
                    "p-8 transition-all group flex items-start justify-between gap-8",
                    r.applied ? "bg-nexus-emerald/[0.02] grayscale-[0.5]" : "hover:bg-muted/30"
                  )}>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className={cn(
                          "text-[9px] font-black h-5 uppercase tracking-tighter",
                          r.impact === 'high' ? 'bg-nexus-rose/10 text-nexus-rose' : 'bg-secondary text-muted-foreground'
                        )}>
                          Impacto {r.impact}
                        </Badge>
                        <h4 className="text-base font-bold text-foreground">{r.title}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{r.description}</p>
                      {r.applied && (
                        <div className="flex items-center gap-1.5 text-[10px] text-nexus-emerald font-bold uppercase tracking-widest pt-2">
                           <ShieldCheck className="h-3 w-3" /> Aplicado via Staged Deploy
                        </div>
                      )}
                    </div>
                    <div className="text-right space-y-4 shrink-0">
                       <div className="space-y-0.5">
                          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Savings / Mo</p>
                          <p className="text-2xl font-black font-mono text-nexus-emerald">-${r.savings.toFixed(2)}</p>
                       </div>
                       {!r.applied && (
                         <Button onClick={() => toast.success(`Aplicando "${r.title}"...`)} className="h-10 px-6 rounded-xl font-bold gap-2">
                            Aplicar <ArrowUpRight className="h-4 w-4" />
                         </Button>
                       )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
           <Card className="border-border/40 rounded-[2.5rem] bg-card/50 backdrop-blur-xl">
             <CardHeader className="p-8 border-b">
               <CardTitle className="text-lg font-bold flex items-center gap-2">
                 <PieChart className="h-5 w-5 text-primary" /> Cost Distribution
               </CardTitle>
             </CardHeader>
             <CardContent className="p-8 space-y-6">
               <div className="space-y-4">
                 {[
                   { name: "GPT-5 (Deliberation)", val: 62, color: "bg-primary" },
                   { name: "Claude 4 (Agent Logic)", val: 24, color: "bg-nexus-purple" },
                   { name: "Gemini 2.5 (High Volume)", val: 14, color: "bg-nexus-blue" }
                 ].map((item, i) => (
                   <div key={i} className="space-y-2">
                     <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span>{item.val}%</span>
                     </div>
                     <Progress value={item.val} className={cn("h-1.5", item.color)} />
                   </div>
                 ))}
               </div>
               <div className="pt-4 border-t border-border/40">
                  <Button variant="outline" className="w-full h-10 rounded-xl text-[10px] font-bold uppercase tracking-widest border-border/40" asChild>
                     <a href="/billing">Gerenciar Billing</a>
                  </Button>
               </div>
             </CardContent>
           </Card>

           <Card className="border-border/40 rounded-[2.5rem] bg-primary/5">
             <CardContent className="p-8 space-y-4">
               <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <DollarSign className="h-6 w-6 text-primary" />
               </div>
               <h3 className="text-lg font-bold">Budget Guardrails</h3>
               <p className="text-xs text-muted-foreground leading-relaxed">
                 O Nexus bloqueia automaticamente chamadas se o orçamento diário for atingido, prevenindo picos de custo por loops infinitos ou ataques.
               </p>
               <Button variant="link" className="p-0 h-auto text-primary font-bold text-xs uppercase tracking-widest" asChild>
                  <a href="/budget-settings">Configurar Limites →</a>
               </Button>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}

function FinOpsMetricCard({ label, value, icon: Icon, trend, subLabel, color = "text-foreground" }: any) {
  return (
    <Card className="bg-card/50 border-border/40 rounded-[2.5rem] p-8 shadow-sm group hover:border-primary/20 transition-all">
      <div className="flex items-start justify-between mb-5">
        <div className="h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center border border-border/20 group-hover:scale-110 transition-transform duration-500">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        {trend && (
           <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-none text-[10px] font-black">
             {trend} SAVINGS
           </Badge>
        )}
      </div>
      <p className="text-4xl font-black tracking-tighter mb-2 truncate">
         <span className={color}>{value}</span>
      </p>
      <div className="flex items-center gap-2">
         <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
         <span className="h-1 w-1 rounded-full bg-border" />
         <p className="text-[10px] font-bold text-muted-foreground opacity-40">{subLabel}</p>
      </div>
    </Card>
  );
}
