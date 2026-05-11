import { useNavigate } from "react-router-dom";
import { LucideIcon } from "lucide-react";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  path?: string;
  variant?: 'default' | 'primary';
}

interface QuickActionsBarProps {
  actions: QuickAction[];
}

export function QuickActionsBar({ actions }: QuickActionsBarProps) {
  const navigate = useNavigate();

  if (actions.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8" role="toolbar" aria-label="Ações rápidas">
      {actions.map((action) => {
        const Icon = action.icon;
        const isPrimary = action.variant === 'primary';
        return (
          <button
            key={action.label}
            onClick={() => {
              if (action.onClick) action.onClick();
              else if (action.path) navigate(action.path);
            }}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl text-xs font-bold transition-all border shadow-sm group ${
              isPrimary
                ? 'nexus-gradient-bg text-primary-foreground border-transparent hover:scale-[1.03] shadow-primary/20'
                : 'bg-card text-foreground border-border/60 hover:border-primary/40 hover:bg-primary/5 hover:scale-[1.03]'
            }`}
          >
            <div className={`p-2 rounded-xl transition-colors ${isPrimary ? 'bg-white/20' : 'bg-primary/10 text-primary group-hover:bg-primary/20'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
