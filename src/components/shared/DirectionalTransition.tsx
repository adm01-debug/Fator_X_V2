import { useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * High-performance Page Transition 10/10.
 * Orchestrates a smooth entry for page content with zero-layout-shift and crisp text.
 * Optimized for heavy dashboard views.
 */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Phase 1: Preparation (Zero Opacity, slight offset)
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    el.style.filter = "blur(4px)";
    el.style.transition = "none";

    // Phase 2: Animation Trigger
    // Use double requestAnimationFrame to ensure the style reset is applied before transition starts
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        containerRef.current.style.transition = "opacity 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease-out";
        containerRef.current.style.opacity = "1";
        containerRef.current.style.transform = "translateY(0)";
        containerRef.current.style.filter = "blur(0)";
      });
    });

    // Accessibility focus management
    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });

    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <div 
      ref={containerRef} 
      className="flex-1 will-change-[opacity,transform]"
    >
      {children}
    </div>
  );
}
