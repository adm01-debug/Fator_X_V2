import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface BackButtonProps {
  className?: string;
  to?: string;
}

/**
 * Context-aware Back Button.
 * Navigates to browser history if possible, otherwise falls back to the parent path.
 */
export function BackButton({ className, to }: BackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on root or dashboard
  if (location.pathname === "/" || location.pathname === "/dashboard") {
    return null;
  }

  const handleBack = () => {
    if (to) {
      navigate(to);
      return;
    }

    // Check history length to see if we can just go back
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      // Fallback: Go to parent path
      const pathSegments = location.pathname.split("/").filter(Boolean);
      if (pathSegments.length > 1) {
        navigate("/" + pathSegments.slice(0, -1).join("/"));
      } else {
        navigate("/");
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className={cn(
        "h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0 group",
        className
      )}
      title="Voltar (Alt+Backspace)"
      aria-label="Voltar para a página anterior"
    >
      <ChevronLeft className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
    </Button>
  );
}
