import { LucideIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SharedEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'minimal';
}

/**
 * 10/10 Experience Empty State
 * Provides clear context and actionable next steps when data is missing.
 */
export function SharedEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
  variant = 'default'
}: SharedEmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-4 duration-700",
      variant === 'default' && "py-24 px-6",
      variant === 'compact' && "py-12 px-4",
      variant === 'minimal' && "py-6 px-2",
      className
    )}>
      <div className={cn(
        "relative mb-8",
        variant === 'default' && "scale-100",
        variant === 'compact' && "scale-90",
        variant === 'minimal' && "scale-75"
      )}>
        <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full scale-150 animate-pulse-slow" />
        <div className="relative h-24 w-24 rounded-[2rem] bg-gradient-to-br from-card to-card/50 flex items-center justify-center border border-border/40 shadow-2xl shadow-primary/5 group">
          <Icon className="h-12 w-12 text-primary/40 group-hover:text-primary transition-colors duration-500" />
          <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl bg-background border border-border shadow-lg flex items-center justify-center">
             <div className="h-2 w-2 rounded-full bg-primary/50 animate-ping" />
          </div>
        </div>
      </div>

      <div className="max-w-md space-y-4 relative">
        <h3 className={cn(
          "font-heading font-black tracking-tight text-foreground",
          variant === 'default' && "text-3xl",
          variant === 'compact' && "text-2xl",
          variant === 'minimal' && "text-xl"
        )}>
          {title}
        </h3>
        <p className="text-muted-foreground font-medium leading-relaxed">
          {description}
        </p>

        {(actionLabel || secondaryActionLabel) && (
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {secondaryActionLabel && onSecondaryAction && (
              <Button 
                variant="outline" 
                onClick={onSecondaryAction}
                className="h-12 px-6 rounded-2xl border-border/50 hover:bg-secondary/50 transition-all font-bold"
              >
                {secondaryActionLabel}
              </Button>
            )}
            {actionLabel && onAction && (
              <Button 
                onClick={onAction}
                className="nexus-gradient-bg text-primary-foreground h-12 px-8 rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all font-black gap-2"
              >
                <Plus className="h-5 w-5" />
                {actionLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
