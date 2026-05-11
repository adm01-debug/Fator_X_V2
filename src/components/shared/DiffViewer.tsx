import { useMemo } from 'react';
import * as diff from 'diff';

interface Props {
  oldText: string;
  newText: string;
  className?: string;
}

export function DiffViewer({ oldText, newText, className = "" }: Props) {
  const changes = useMemo(() => {
    // Word-level diff for better readability in prompts
    return diff.diffWords(oldText || '', newText || '');
  }, [oldText, newText]);

  return (
    <div className={`font-mono text-[11px] leading-relaxed p-2 rounded bg-background/50 border border-border/40 whitespace-pre-wrap break-all ${className}`}>
      {changes.map((part, index) => {
        const color = part.added 
          ? 'bg-nexus-emerald/20 text-nexus-emerald line-through-none' 
          : part.removed 
            ? 'bg-destructive/20 text-destructive line-through decoration-destructive/50' 
            : 'text-foreground/80';
        
        return (
          <span key={index} className={color}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
}
