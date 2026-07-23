/**
 * ScrollToBottomButton — FAB que aparece quando o usuário rolou pra cima.
 */
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  unread?: number;
}

export function ScrollToBottomButton({ visible, onClick, unread }: ScrollToBottomButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      variant="secondary"
      aria-label="Ir para o fim da conversa"
      className={cn(
        'absolute bottom-4 right-4 z-10 h-10 w-10 rounded-full shadow-nexus-lg border border-border/60',
        'bg-card/95 backdrop-blur transition-all duration-200',
        visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none',
      )}
    >
      <ChevronDown className="h-4 w-4" />
      {unread && unread > 0 ? (
        <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-nexus-green text-background text-meta flex items-center justify-center px-1">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </Button>
  );
}
