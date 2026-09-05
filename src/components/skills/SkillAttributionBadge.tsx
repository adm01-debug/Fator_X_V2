import { ExternalLink, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { buildSkillAttribution, type SkillAttributionSource } from '@/lib/skills/attribution';

export interface SkillAttributionBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Colunas de origem da skill (`source_repo`, `source_url`, `source_license`). */
  skill: SkillAttributionSource;
}

/**
 * Selo de atribuição de origem/licença de uma skill.
 *
 * Não renderiza nada para skills nativas do Nexus (sem origem externa),
 * evitando ruído visual no marketplace. Para skills portadas, cumpre a
 * exigência de aviso das licenças permissivas (MIT, Apache-2.0, BSD…).
 */
export function SkillAttributionBadge({ skill, className, ...rest }: SkillAttributionBadgeProps) {
  const attribution = buildSkillAttribution(skill);

  if (attribution.isNative) return null;

  const licenseLabel = attribution.license ?? 'licença não informada';

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)} {...rest}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'text-meta gap-1 font-normal',
              attribution.copyleft
                ? 'border-nexus-amber/40 text-nexus-amber'
                : 'text-muted-foreground',
            )}
          >
            <Scale className="h-3 w-3 shrink-0" aria-hidden="true" />
            {licenseLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-[260px] text-meta">
            {attribution.noticeText}
            {attribution.copyleft
              ? ' Licença copyleft: a redistribuição exige manter os mesmos termos.'
              : attribution.requiresNotice
                ? ' É obrigatório preservar este aviso de atribuição.'
                : ''}
          </p>
        </TooltipContent>
      </Tooltip>

      {attribution.label &&
        (attribution.url ? (
          <a
            href={attribution.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`Abrir a origem da skill em ${attribution.label}`}
            className="text-meta text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            {attribution.label}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-meta text-muted-foreground">{attribution.label}</span>
        ))}
    </div>
  );
}
