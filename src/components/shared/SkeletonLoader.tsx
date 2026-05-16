import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  variant: 'card-grid' | 'table' | 'form' | 'dashboard' | 'detail';
  count?: number;
  className?: string;
}

/**
 * 10/10 UX Skeleton Loader
 * Predefined patterns for seamless content transition.
 */
export function SkeletonLoader({ variant, count = 6, className }: SkeletonLoaderProps) {
  if (variant === 'card-grid') {
    return (
      <div className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-3", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="p-6 rounded-[2rem] border border-border/40 bg-card/30 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="h-20 w-full rounded-2xl bg-muted/20 border border-border/20" />
            <div className="flex justify-between items-center pt-2">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn("w-full border border-border/40 rounded-2xl overflow-hidden", className)}>
        <div className="bg-muted/30 h-12 flex items-center px-6 gap-4 border-b border-border/40">
           {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-16 flex items-center px-6 gap-4 border-b border-border/10 last:border-0">
             {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-3 flex-1" />)}
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className={cn("space-y-8 max-w-2xl", className)}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
        </div>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
        <div className="flex gap-4 pt-4">
          <Skeleton className="h-12 w-32 rounded-xl" />
          <Skeleton className="h-12 w-32 rounded-xl" />
        </div>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className={cn("space-y-8", className)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 rounded-[2rem] border border-border/40 bg-card/30 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-[400px] w-full rounded-[2.5rem]" />
           </div>
           <div className="space-y-6">
              <Skeleton className="h-[400px] w-full rounded-[2.5rem]" />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 animate-pulse", className)}>
      <Skeleton className="h-12 w-full max-w-md rounded-xl" />
      <Skeleton className="h-64 w-full rounded-[2.5rem]" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}
