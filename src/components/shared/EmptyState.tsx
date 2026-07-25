import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  illustration?: 'default' | 'agents' | 'data' | 'search';
}

const ILLUSTRATIONS: Record<string, string> = {
  default: '📭',
  agents: '🤖',
  data: '📊',
  search: '🔍',
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  illustration = 'default',
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in-up" role="status" aria-label={title}>
      {/* Illustrated circle with glow */}
      <div className="relative mb-8 group">
        <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 flex items-center justify-center border border-primary/20 shadow-[0_0_40px_-10px_hsl(var(--primary)/0.2)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_50px_-5px_hsl(var(--primary)/0.3)]" aria-hidden="true">
          <span className="text-4xl drop-shadow-sm transition-transform duration-500 group-hover:rotate-12">{ILLUSTRATIONS[illustration]}</span>
        </div>
        <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-2xl bg-card border border-border flex items-center justify-center shadow-nexus-xl transition-all duration-500 group-hover:translate-x-1 group-hover:translate-y-1">
          <Icon className="h-5 w-5 text-primary/70" />
        </div>
      </div>

      <h3 className="text-title-sm font-heading font-semibold text-foreground mb-1.5">{title}</h3>
      {description && (
        <p className="text-body-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>
      )}

      <div className="flex items-center gap-2 mt-5">
        {actionLabel && onAction && (
          <Button onClick={onAction} size="sm" className="gap-1.5">
            {actionLabel}
          </Button>
        )}
        {secondaryLabel && onSecondary && (
          <Button onClick={onSecondary} variant="outline" size="sm" className="gap-1.5">
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
