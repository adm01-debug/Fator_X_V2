/**
 * Visualização do diff entre dois prompts compilados.
 *
 * Dois blocos, na ordem em que uma revisão de mudança precisa ler:
 *   1. Skills que mudaram de destino (o que o agente ganhou/perdeu).
 *   2. Diff textual do prompt final.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  SKILL_CHANGE_LABEL,
  type PromptDiffResult,
  type SkillChangeKind,
} from '@/lib/skills/promptDiff';

const CHANGE_TONE: Record<SkillChangeKind, string> = {
  saiu_do_prompt: 'border-nexus-rose/40 bg-nexus-rose/10 text-nexus-rose',
  removida: 'border-nexus-rose/40 bg-nexus-rose/10 text-nexus-rose',
  adicionada: 'border-nexus-emerald/40 bg-nexus-emerald/10 text-nexus-emerald',
  entrou_no_prompt: 'border-nexus-emerald/40 bg-nexus-emerald/10 text-nexus-emerald',
  alterada: 'border-nexus-amber/40 bg-nexus-amber/10 text-nexus-amber',
  inalterada: 'border-border/60 bg-muted/40 text-muted-foreground',
};

export interface SkillPromptDiffViewProps {
  diff: PromptDiffResult;
  leftLabel: string;
  rightLabel: string;
}

export function SkillPromptDiffView({ diff, leftLabel, rightLabel }: SkillPromptDiffViewProps) {
  const relevantes = diff.skills.filter((s) => s.kind !== 'inalterada');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-meta">
        <Badge variant="outline">{leftLabel}</Badge>
        <span className="text-muted-foreground">→</span>
        <Badge variant="outline">{rightLabel}</Badge>
        <span className="text-muted-foreground">
          {diff.lineStats.added} linhas + · {diff.lineStats.removed} linhas − ·{' '}
          {diff.tokenDelta >= 0 ? '+' : ''}
          {diff.tokenDelta} tokens
        </span>
      </div>

      {diff.identical ? (
        <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-body-sm text-muted-foreground">
          Os dois prompts compilados são idênticos.
        </p>
      ) : null}

      {relevantes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-meta font-medium">Skills que mudaram ({relevantes.length})</p>
          <ul className="space-y-1.5">
            {relevantes.map((s) => (
              <li
                key={s.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
              >
                <span className="text-body-sm">{s.name}</span>
                <Badge variant="outline" className={cn('text-meta', CHANGE_TONE[s.kind])}>
                  {SKILL_CHANGE_LABEL[s.kind]}
                </Badge>
              </li>
            ))}
          </ul>
          {diff.totals.leftPrompt > 0 ? (
            <p className="text-meta text-nexus-rose">
              {diff.totals.leftPrompt} skill(s) continuam instaladas, mas caíram no overflow do teto
              e o agente deixou de conhecê-las.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-meta font-medium">Diff do prompt final</p>
        <pre className="max-h-96 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-meta leading-relaxed">
          {diff.lines.map((l, i) => (
            <div
              key={`${i}-${l.kind}`}
              className={cn(
                'whitespace-pre-wrap break-words px-1',
                l.kind === 'added' && 'bg-nexus-emerald/10 text-nexus-emerald',
                l.kind === 'removed' && 'bg-nexus-rose/10 text-nexus-rose',
                l.kind === 'same' && 'text-muted-foreground',
              )}
            >
              {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}
              {l.text || ' '}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
