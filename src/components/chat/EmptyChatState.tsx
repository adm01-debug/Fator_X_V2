import { MessageCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function EmptyChatState() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-6 py-12">
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-nexus-purple/20 border border-border/50 flex items-center justify-center mb-5">
        <MessageCircle className="h-9 w-9 text-primary" />
      </div>
      <h2 className="text-title-sm font-semibold mb-2">Selecione um agente para começar</h2>
      <p className="text-body-sm text-muted-foreground max-w-md mb-5">
        Suas conversas com cada agente ficam salvas localmente. Escolha um agente à esquerda e envie a primeira mensagem.
      </p>
      <Button
        onClick={() => navigate('/agents/create')}
        variant="outline"
        className="gap-2"
      >
        <Plus className="h-4 w-4" /> Criar novo agente
      </Button>
    </div>
  );
}
