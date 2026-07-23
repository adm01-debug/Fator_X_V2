import { SquareStack, Palette } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ObsidianModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
  accentPurple: boolean;
  onToggleAccent: () => void;
  className?: string;
}

/**
 * Controle discreto para alternar o "Obsidian Mode" — skin alternativa
 * densa/técnica do Super Cérebro. Mostra também um toggle secundário
 * para trocar o accent para roxo Obsidian.
 */
export function ObsidianModeToggle({
  enabled,
  onToggle,
  accentPurple,
  onToggleAccent,
  className,
}: ObsidianModeToggleProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border border-border/60 bg-card px-3 py-1.5",
          className,
        )}
        role="group"
        aria-label="Alternar Obsidian Mode"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
            <label className="flex items-center gap-2 cursor-pointer text-meta">
              <SquareStack className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="select-none">Obsidian Mode</span>
              <Switch
                checked={enabled}
                onCheckedChange={onToggle}
                aria-label="Ativar Obsidian Mode"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Skin alternativa: painéis densos, bordas duras, sem glass.
          </TooltipContent>
        </Tooltip>

        {enabled && (
          <>
            <span className="h-4 w-px bg-border" aria-hidden />
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label className="flex items-center gap-2 cursor-pointer text-meta">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span className="select-none">Accent roxo</span>
                  <Switch
                    checked={accentPurple}
                    onCheckedChange={onToggleAccent}
                    aria-label="Trocar accent para roxo Obsidian"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Aplica o roxo característico do Obsidian ao accent primário.
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
