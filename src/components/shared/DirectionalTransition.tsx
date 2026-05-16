import { useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Lightweight page transition focused on crisp text rendering.
 * Avoids transform-based animation on large containers, which can blur typography.
 */
export function DirectionalTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.style.opacity = "0";
    el.style.transform = "translateY(8px) scale(0.995)";
    el.style.transition = "none";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1), transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)";
        el.style.opacity = "1";
        el.style.transform = "translateY(0) scale(1)";
      });
    });

    const main = document.getElementById("main-content");
    if (main) main.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div ref={containerRef} className="flex-1">
      {children}
    </div>
  );
}
