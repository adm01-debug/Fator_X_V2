import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, CornerUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BackButtonProps {
  className?: string;
  to?: string;
}

/**
 * Context-aware Back Button with visual feedback and history protection.
 * Elevated for 10/10 UX with tooltips and mobile-first touch targets.
 */
export function BackButton({ className, to }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Don't show on root or dashboard unless forced via props
  if (!to && (location.pathname === "/" || location.pathname === "/dashboard")) {
    return null;
  }

  const handleBack = () => {
    if (to) {
      navigate(to);
      return;
    }

    // Safety: check if there's actually a history to go back to
    // If we're at the first entry of the session, go to dashboard
    if (window.history.length <= 1) {
      navigate("/");
      return;
    }

    // Standard back behavior
    navigate(-1);
  };

  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className={cn(
        "h-9 w-9 sm:h-10 sm:w-10 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0 group relative",
        "active:scale-95 touch-none", // Mobile feedback
        className
      )}
      aria-label="Voltar para a página anterior"
    >
      <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
      {/* Visual indicator of "Parent" navigation if no history */}
      {window.history.length <= 1 && (
        <CornerUpLeft className="absolute -top-1 -right-1 h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </Button>
  );

  if (isMobile) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px] font-bold uppercase tracking-widest bg-background/95 backdrop-blur-md border-primary/20">
        Voltar <span className="ml-2 text-muted-foreground/60">Alt+←</span>
      </TooltipContent>
    </Tooltip>
  );
}
