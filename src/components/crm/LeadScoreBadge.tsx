/**
 * LeadScoreBadge — score do lead com a faixa (tier) derivada do ICP.
 *
 * O número sozinho não é acionável ("72 é bom?"). A faixa traduz o corte
 * configurado no perfil de ICP em uma decisão de priorização.
 */
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TIER_LABELS, type LeadTier } from '@/services/crmScoringService';

const TIER_STYLES: Record<LeadTier, string> = {
  hot: 'bg-nexus-success/15 text-nexus-success border-nexus-success/30',
  qualified: 'bg-primary/15 text-primary border-primary/30',
  nurture: 'bg-nexus-warning/15 text-nexus-warning border-nexus-warning/30',
  cold: 'bg-muted text-muted-foreground border-border',
};

export interface LeadScoreBadgeProps {
  score: number | null;
  /** `score_reason` cru vindo do banco — tolerante a formato antigo ou vazio. */
  scoreReason?: unknown;
  className?: string;
}

interface ParsedReason {
  tier: LeadTier | null;
  criteria: Array<{ label: string; points: number; reason: string }>;
  missing: string[];
}

/** O JSONB é escrito pelo serviço, mas pode vir de uma versão anterior — nunca confie na forma. */
function parseReason(raw: unknown): ParsedReason {
  const empty: ParsedReason = { tier: null, criteria: [], missing: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const obj = raw as Record<string, unknown>;
  const tier = obj.tier;
  return {
    tier:
      tier === 'hot' || tier === 'qualified' || tier === 'nurture' || tier === 'cold' ? tier : null,
    criteria: Array.isArray(obj.criteria)
      ? (obj.criteria as Array<Record<string, unknown>>)
          .filter((c) => typeof c?.label === 'string')
          .map((c) => ({
            label: String(c.label),
            points: Number(c.points) || 0,
            reason: typeof c.reason === 'string' ? c.reason : '',
          }))
      : [],
    missing: Array.isArray(obj.missing_signals)
      ? (obj.missing_signals as unknown[]).map(String)
      : [],
  };
}

export function LeadScoreBadge({ score, scoreReason, className }: LeadScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className={cn('text-body-sm text-muted-foreground', className)} aria-label="Sem score">
        —
      </span>
    );
  }

  const parsed = parseReason(scoreReason);
  const tier = parsed.tier;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'tabular-nums font-medium',
        tier ? TIER_STYLES[tier] : TIER_STYLES.cold,
        className,
      )}
    >
      {score.toFixed(0)}
      {tier && <span className="ml-1.5 font-normal">{TIER_LABELS[tier]}</span>}
    </Badge>
  );

  if (parsed.criteria.length === 0) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* botão em vez de span: o tooltip precisa ser alcançável por teclado */}
        <button
          type="button"
          className="cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Detalhes do score ${score.toFixed(0)}`}
        >
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        <ul className="space-y-0.5">
          {parsed.criteria.map((c) => (
            <li key={c.label} className="flex items-baseline justify-between gap-3 text-caption">
              <span>{c.label}</span>
              <span className="tabular-nums">{c.points.toFixed(1)} pts</span>
            </li>
          ))}
        </ul>
        {parsed.missing.length > 0 && (
          <p className="text-caption text-nexus-warning">Sem dado: {parsed.missing.join(', ')}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
