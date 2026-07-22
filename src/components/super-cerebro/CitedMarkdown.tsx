import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CitationDialog } from './CitationDialog';
import type { CerebroCitation } from '@/types/cerebroCitations';
import { logger } from '@/lib/logger';

interface CitedMarkdownProps {
  text: string;
  citations: CerebroCitation[];
}

const CITATION_RE = /\[(\d{1,2})\]/g;

/**
 * Renders markdown text with clickable [n] citation chips that open a source dialog.
 * Unknown citation numbers fall back to plain text and are logged.
 */
export function CitedMarkdown({ text, citations }: CitedMarkdownProps) {
  const [open, setOpen] = useState<CerebroCitation | null>(null);

  const byNumber = useMemo(() => {
    const map = new Map<number, CerebroCitation>();
    for (const c of citations) map.set(c.n, c);
    return map;
  }, [citations]);

  const renderWithChips = (input: string) => {
    if (!input) return input;
    const parts: (string | JSX.Element)[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    CITATION_RE.lastIndex = 0;
    let chipKey = 0;
    while ((match = CITATION_RE.exec(input)) !== null) {
      const n = Number(match[1]);
      const citation = byNumber.get(n);
      if (match.index > lastIdx) parts.push(input.slice(lastIdx, match.index));
      if (!citation) {
        logger.warn('cerebro.citation.unknown', { n });
        parts.push(match[0]);
      } else {
        parts.push(
          <TooltipProvider key={`chip-${chipKey++}`} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setOpen(citation)}
                  className="mx-0.5 inline-flex align-baseline"
                  aria-label={`Ver fonte ${n}: ${citation.document_title}`}
                >
                  <Badge
                    variant="secondary"
                    className="cursor-pointer h-5 px-1.5 text-[10px] font-bold hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    {n}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs font-semibold">{citation.document_title}</p>
                {citation.page != null && (
                  <p className="text-[10px] text-muted-foreground">Página {citation.page}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>,
        );
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < input.length) parts.push(input.slice(lastIdx));
    return parts;
  };

  return (
    <div className="text-body-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_p]:my-2">
      <ReactMarkdown
        components={{
          p: ({ children }) => {
            const processed = (Array.isArray(children) ? children : [children]).flatMap((child) =>
              typeof child === 'string' ? renderWithChips(child) : [child],
            );
            return <p>{processed}</p>;
          },
          li: ({ children }) => {
            const processed = (Array.isArray(children) ? children : [children]).flatMap((child) =>
              typeof child === 'string' ? renderWithChips(child) : [child],
            );
            return <li>{processed}</li>;
          },
        }}
      >
        {text}
      </ReactMarkdown>

      {citations.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground self-center">
            Fontes:
          </span>
          {citations.map((c) => (
            <button
              key={c.chunk_id}
              type="button"
              onClick={() => setOpen(c)}
              className="text-[11px] px-2 py-1 rounded-md bg-secondary/40 hover:bg-secondary transition-colors border border-border/40 max-w-[240px] truncate text-left"
              title={c.document_title}
            >
              <span className="font-bold text-primary mr-1">[{c.n}]</span>
              {c.document_title}
              {c.page != null && <span className="text-muted-foreground"> · p.{c.page}</span>}
            </button>
          ))}
        </div>
      )}

      <CitationDialog citation={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
