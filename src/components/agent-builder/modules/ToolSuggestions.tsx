import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus, Loader2, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ToolSuggestion {
  name: string;
  description: string;
  category: 'data' | 'action' | 'compute' | 'integration';
  reason: string;
}

interface Props {
  mission: string;
  persona: string;
  onAdd: (tool: ToolSuggestion) => void;
}

export function ToolSuggestions({ mission, onAdd }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ToolSuggestion[]>([]);

  const fetchSuggestions = async () => {
    if (!mission) {
      toast.error("Defina a missão do agente primeiro para receber sugestões.");
      return;
    }
    setLoading(true);
    // Simulação de chamada de IA — em produção isso chamaria uma Edge Function
    setTimeout(() => {
      const mockSuggestions: ToolSuggestion[] = [
        {
          name: "Consulta SQL Avançada",
          description: "Executa queries complexas no banco de dados para extrair insights.",
          category: "data",
          reason: "Baseado na sua missão de análise de dados."
        },
        {
          name: "Integração Slack",
          description: "Envia notificações e alertas diretamente para canais do Slack.",
          category: "action",
          reason: "Útil para a persona de comunicador e supervisor."
        },
        {
          name: "Processador de PDFs",
          description: "Extrai texto e metadados de documentos PDF carregados.",
          category: "compute",
          reason: "Complementa o conhecimento do agente com documentos externos."
        }
      ];
      setSuggestions(mockSuggestions);
      setLoading(false);
    }, 1500);
  };

  if (suggestions.length === 0) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={fetchSuggestions} 
        disabled={loading}
        className="gap-2 border-nexus-blue/40 text-nexus-blue hover:bg-nexus-blue/10"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Sugerir ferramentas com IA
      </Button>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-nexus-blue flex items-center gap-1.5 uppercase tracking-wider">
          <Sparkles className="h-3 w-3" /> Sugestões da IA
        </h4>
        <Button variant="ghost" size="sm" onClick={() => setSuggestions([])} className="h-6 w-6 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {suggestions.map((s, i) => (
          <div key={i} className="rounded-lg border border-nexus-blue/20 bg-nexus-blue/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{s.name}</span>
                <Badge variant="outline" className="text-[9px] h-4 uppercase">{s.category}</Badge>
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 gap-1 text-xs border-nexus-blue/30 hover:bg-nexus-blue/10"
                onClick={() => {
                  onAdd(s);
                  setSuggestions(prev => prev.filter((_, idx) => idx !== i));
                  toast.success(`Ferramenta "${s.name}" adicionada.`);
                }}
              >
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{s.description}</p>
            <div className="flex items-center gap-1.5 text-[9px] text-nexus-blue/70 font-medium">
              <Check className="h-2.5 w-2.5" /> {s.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
