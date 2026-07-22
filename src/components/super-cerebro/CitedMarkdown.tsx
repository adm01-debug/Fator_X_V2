import { useState, useMemo, useEffect, Children, isValidElement, cloneElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CitationDialog } from './CitationDialog';
import type { CerebroCitation } from '@/types/cerebroCitations';
import { logger } from '@/lib/logger';
import { validateCitations } from '@/lib/citationValidation';
import { prefetchSignedUrlForDocument } from '@/lib/signedUrlCache';

interface CitedMarkdownProps {
  text: string;
  citations: CerebroCitation[];
}


/**
 * Matches:
 *  - [1], [12]
 *  - [1,2], [1, 2, 3]
 *  - [1][2] (contíguos)
 *  - (1), (1,2)  — fallback quando o modelo usa parênteses
 *  - superscritos ¹ ² ³
 */
const CITATION_RE = /(\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\])|(\((\d{1,2}(?:\s*,\s*\d{1,2})*)\))|([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g;

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

function parseNumbers(raw: string, kind: 'bracket' | 'paren' | 'sup'): number[] {
  if (kind === 'sup') {
    const digits = raw.split('').map((c) => SUPERSCRIPT_MAP[c] ?? '').join('');
    if (!digits) return [];
    return [Number(digits)];
  }
  return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

/**
 * Renders markdown text with clickable [n] citation chips that open a source dialog.
 * Fallback tolerante — reconhece [n], [1,2], (1,2) e superscritos ¹²³, e processa
 * texto dentro de qualquer elemento inline (p, li, strong, em, a, code, headings, td…).
 */
export function CitedMarkdown({ text, citations }: CitedMarkdownProps) {
  const [open, setOpen] = useState<CerebroCitation | null>(null);

  const byNumber = useMemo(() => {
    const map = new Map<number, CerebroCitation>();
    for (const c of citations) map.set(c.n, c);
    return map;
  }, [citations]);

  // Auditoria: valida consistência entre [n] do texto e o array de citations.
  useEffect(() => {
    if (!text || citations.length === 0) return;
    const result = validateCitations(text, citations);
    if (!result.valid) {
      logger.warn('cerebro.citation.validation_failed', {
        missing: result.missing,
        unused: result.unused,
        issues: result.issues.map((i) => ({ code: i.code, n: i.n, chunkId: i.chunkId })),
      });
    }
  }, [text, citations]);


  const renderChip = (n: number, key: string): JSX.Element | string => {
    const citation = byNumber.get(n);
    if (!citation) {
      logger.warn('cerebro.citation.unknown', { n });
      return `[${n}]`;
    }
    const warm = () => {
      if (citation.document_id) void prefetchSignedUrlForDocument(citation.document_id);
    };
    return (
      <TooltipProvider key={key} delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(citation)}
              onMouseEnter={warm}
              onFocus={warm}
              onTouchStart={warm}
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
      </TooltipProvider>
    );
  };


  const renderWithChips = (input: string, keyPrefix: string): (string | JSX.Element)[] => {
    if (!input) return [input];
    const parts: (string | JSX.Element)[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    CITATION_RE.lastIndex = 0;
    let idx = 0;
    while ((match = CITATION_RE.exec(input)) !== null) {
      const raw = match[0];
      const bracketNums = match[2];
      const parenNums = match[4];
      const supRaw = match[5];
      const nums = bracketNums
        ? parseNumbers(bracketNums, 'bracket')
        : parenNums
          ? parseNumbers(parenNums, 'paren')
          : supRaw
            ? parseNumbers(supRaw, 'sup')
            : [];
      // Só substituímos parênteses/superscritos quando corresponderem a citações reais,
      // para não capturar "(2024)" ou "H²O".
      const allKnown = nums.length > 0 && nums.every((n) => byNumber.has(n));
      if (!bracketNums && !allKnown) continue;

      if (match.index > lastIdx) parts.push(input.slice(lastIdx, match.index));

      if (nums.length === 0) {
        parts.push(raw);
      } else {
        nums.forEach((n) => {
          parts.push(renderChip(n, `${keyPrefix}-${idx++}`));
        });
      }
      lastIdx = match.index + raw.length;
    }
    if (lastIdx < input.length) parts.push(input.slice(lastIdx));
    return parts;
  };

  /** Percorre recursivamente os children e substitui strings por chips. */
  const processChildren = (children: ReactNode, keyPrefix = 'k'): ReactNode[] => {
    const arr = Children.toArray(children);
    const out: ReactNode[] = [];
    arr.forEach((child, i) => {
      if (typeof child === 'string') {
        renderWithChips(child, `${keyPrefix}-${i}`).forEach((p) => out.push(p));
        return;
      }
      if (typeof child === 'number') {
        out.push(String(child));
        return;
      }
      if (isValidElement(child)) {
        const el = child as JSX.Element;
        const nested = processChildren(el.props?.children, `${keyPrefix}-${i}`);
        out.push(cloneElement(el, { key: el.key ?? `${keyPrefix}-${i}` }, nested));
        return;
      }
      out.push(child);
    });
    return out;
  };


  const wrap = (Tag: keyof JSX.IntrinsicElements) =>
    ({ children }: { children?: ReactNode }) => <Tag>{processChildren(children)}</Tag>;

  return (
    <div className="text-body-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_p]:my-2">
      <ReactMarkdown
        components={{
          p: wrap('p'),
          li: wrap('li'),
          strong: wrap('strong'),
          em: wrap('em'),
          h1: wrap('h1'),
          h2: wrap('h2'),
          h3: wrap('h3'),
          h4: wrap('h4'),
          h5: wrap('h5'),
          h6: wrap('h6'),
          blockquote: wrap('blockquote'),
          td: wrap('td'),
          th: wrap('th'),
          span: wrap('span'),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {processChildren(children)}
            </a>
          ),
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
              onMouseEnter={() => c.document_id && void prefetchSignedUrlForDocument(c.document_id)}
              onFocus={() => c.document_id && void prefetchSignedUrlForDocument(c.document_id)}
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
