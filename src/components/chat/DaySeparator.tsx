/**
 * DaySeparator — pílula central "Hoje / Ontem / dd MMM yyyy" (pt-BR).
 */
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DaySeparatorProps {
  timestamp: number;
}

export function DaySeparator({ timestamp }: DaySeparatorProps) {
  const d = new Date(timestamp);
  const label = isToday(d)
    ? 'Hoje'
    : isYesterday(d)
      ? 'Ontem'
      : format(d, "dd 'de' MMM yyyy", { locale: ptBR });

  return (
    <div className="flex justify-center my-3">
      <span className="rounded-full bg-muted/70 backdrop-blur-sm border border-border/40 px-3 py-1 text-meta uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
