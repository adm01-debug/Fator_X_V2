import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Rocket, ShieldCheck, Zap, AlertTriangle, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DeploymentWizardProps {
  agentName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDeploy: (env: 'staging' | 'production') => void;
}

export function DeploymentWizard({ agentName, isOpen, onOpenChange, onDeploy }: DeploymentWizardProps) {
  const [step, setStep] = useState(1);
  const [targetEnv, setTargetEnv] = useState<'staging' | 'production' | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  const handleNext = () => setStep(s => s + 1);
  const handlePrev = () => setStep(s => s - 1);

  const startDeploy = async () => {
    if (!targetEnv) return;
    setIsDeploying(true);
    
    // Simulate industrial deployment pipeline
    await new Promise(r => setTimeout(r, 2000));
    
    onDeploy(targetEnv);
    setIsDeploying(false);
    onOpenChange(false);
    setStep(1);
    setTargetEnv(null);
    toast.success(`Agente ${agentName} implantado em ${targetEnv.toUpperCase()}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-[2.5rem] p-8 border-border/40 shadow-nexus-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black font-heading">Pipeline de Implantação</DialogTitle>
          </div>
          <DialogDescription className="text-body-sm font-medium">
            Promovendo <span className="text-foreground font-bold">{agentName}</span> através do funil industrial de entrega.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {/* Progress bar */}
          <div className="flex items-center justify-between mb-8 px-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center">
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-meta font-bold transition-all duration-500",
                  step >= i ? "bg-primary text-primary-foreground shadow-nexus-lg shadow-primary/20" : "bg-muted text-muted-foreground"
                )}>
                  {step > i ? <CheckCircle2 className="h-4 w-4" /> : i}
                </div>
                {i < 3 && <div className={cn("h-0.5 w-16 mx-2 rounded-full transition-all duration-500", step > i ? "bg-primary" : "bg-muted")} />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-4">Selecione o Ambiente de Destino</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setTargetEnv('staging')}
                  className={cn(
                    "flex flex-col items-center p-6 rounded-3xl border-2 transition-all group",
                    targetEnv === 'staging' ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/40 hover:border-primary/20"
                  )}
                >
                  <ShieldCheck className={cn("h-10 w-10 mb-3", targetEnv === 'staging' ? "text-primary" : "text-muted-foreground")} />
                  <span className="font-bold text-body-sm">Staging</span>
                  <span className="text-meta uppercase font-black opacity-50 mt-1">Validação IA</span>
                </button>
                <button 
                  onClick={() => setTargetEnv('production')}
                  className={cn(
                    "flex flex-col items-center p-6 rounded-3xl border-2 transition-all group",
                    targetEnv === 'production' ? "border-nexus-emerald bg-nexus-emerald/5 ring-1 ring-nexus-emerald/20" : "border-border/40 hover:border-nexus-emerald/20"
                  )}
                >
                  <Rocket className={cn("h-10 w-10 mb-3", targetEnv === 'production' ? "text-nexus-emerald" : "text-muted-foreground")} />
                  <span className="font-bold text-body-sm">Produção</span>
                  <span className="text-meta uppercase font-black opacity-50 mt-1">Live Ops</span>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <p className="text-meta font-black uppercase tracking-widest text-muted-foreground mb-4">Checklist de Integridade</p>
              <div className="space-y-3">
                {[
                  { label: "Verificação de Guardrails", status: "Passou", icon: ShieldCheck },
                  { label: "Análise de Latência P95", status: "< 800ms", icon: Zap },
                  { label: "Consistência de Memória", status: "Ok", icon: Rocket }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-border/20">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-nexus-emerald" />
                      <span className="text-meta font-bold text-foreground">{item.label}</span>
                    </div>
                    <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-none text-meta font-black">{item.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 text-center">
              <div className="h-16 w-16 bg-nexus-amber/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-nexus-amber" />
              </div>
              <h4 className="text-title-sm font-bold">Confirmação Final</h4>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Você está prestes a implantar a versão <span className="font-bold text-primary">v2.4.1</span> em <span className="font-black text-foreground uppercase tracking-widest">{targetEnv}</span>. 
                Isso afetará todos os canais conectados.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={handlePrev} className="rounded-xl font-bold uppercase text-meta tracking-widest">
              Voltar
            </Button>
          )}
          {step < 3 ? (
            <Button 
              onClick={handleNext} 
              disabled={!targetEnv}
              className="flex-1 nexus-gradient-bg text-primary-foreground font-bold rounded-xl h-12"
            >
              Próximo Passo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button 
              onClick={startDeploy} 
              disabled={isDeploying}
              className="flex-1 bg-nexus-emerald text-white hover:bg-nexus-emerald/90 font-bold rounded-xl h-12 shadow-nexus-xl shadow-nexus-emerald/20"
            >
              {isDeploying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Implantando...</> : "Confirmar Implantação"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
