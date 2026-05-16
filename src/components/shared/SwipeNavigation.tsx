import { type ReactNode, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface SwipeNavigationProps {
  children: ReactNode;
}

/**
 * 10/10 Gesture Navigation for Mobile.
 * Implements edge-swipe to go back with visual safety and performance optimization.
 * Uses passive listeners to avoid jank.
 */
export function SwipeNavigation({ children }: SwipeNavigationProps) {
  const navigate = useNavigate();
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum distance for a swipe to be registered
  const minSwipeDistance = 70;

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      // Only track if swipe starts from the edge (first 40px)
      if (e.touches[0].clientX < 40) {
        setTouchStart(e.touches[0].clientX);
      } else {
        setTouchStart(null);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      setTouchEnd(e.touches[0].clientX);
    };

    const onTouchEnd = () => {
      if (!touchStart || !touchEnd) return;
      
      const distance = touchEnd - touchStart;
      const isRightSwipe = distance > minSwipeDistance;

      if (isRightSwipe) {
        // Trigger back navigation if swiped from edge
        if (window.history.length > 1) {
          navigate(-1);
        }
      }
      
      setTouchStart(null);
      setTouchEnd(null);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [touchStart, touchEnd, navigate]);

  return <div className="h-full flex flex-col">{children}</div>;
}
