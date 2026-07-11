import { AlertTriangle, CheckCircle2, ShieldAlert, Zap } from 'lucide-react';
import type { VersionValidationResult, VersionValidationIssue } from '@/lib/validations/agentVersionValidator';
import { Button } from '@/components/ui/button';

interface VersionValidationPanelProps {
  result: VersionValidationResult;
  onFix?: (issue: VersionValidationIssue) => void;
}

function IssueRow({ issue, onFix }: { issue: VersionValidationIssue; onFix?: (issue: VersionValidationIssue) => void }) {
  const isError = issue.level === 'error';
  const Icon = isError ? ShieldAlert : AlertTriangle;
  const color = isError ? 'text-destructive' : 'text-nexus-amber';
  
  // Define if this issue has a quick fix
  const hasQuickFix = [
    'prompt.empty_blocks',
    'config.rag_no_sources',
    'config.react_without_tools',
    'config.expensive_for_simple',
    'config.production_no_guardrails',
    'config.long_term_without_short',
    'prompt.no_identity'
  ].includes(issue.code);

  return (
    <li className="flex items-start gap-2 text-meta">
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <span className={`${color} font-medium`}>{isError ? 'Erro' : 'Aviso'}</span>
        <span className="text-foreground/90"> · {issue.message}</span>
        <span className="ml-1.5 font-mono text-meta text-muted-foreground">{issue.code}</span>
      </div>
      {hasQuickFix && onFix && (
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-meta gap-1 text-primary hover:text-primary hover:bg-primary/10 shrink-0"
          onClick={() => onFix(issue)}
        >
          <Zap className="h-3 w-3" />
          Corrigir
        </Button>
      )}
    </li>
  );
}

export function VersionValidationPanel({ result, onFix }: VersionValidationPanelProps) {
  const { errors, warnings } = result;
  const total = errors.length + warnings.length;

  if (total === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-nexus-emerald/30 bg-nexus-emerald/5 p-2.5 flex items-center gap-2"
      >
        <CheckCircle2 className="h-4 w-4 text-nexus-emerald shrink-0" aria-hidden />
        <span className="text-meta text-nexus-emerald font-medium">Validações OK — pronto para salvar</span>
      </div>
    );
  }

  const headerColor = errors.length > 0 ? 'text-destructive' : 'text-nexus-amber';
  const borderColor =
    errors.length > 0
      ? 'border-destructive/30 bg-destructive/5'
      : 'border-nexus-amber/30 bg-nexus-amber/5';

  return (
    <div
      role={errors.length > 0 ? 'alert' : 'status'}
      aria-live="polite"
      className={`rounded-lg border ${borderColor} p-2.5 space-y-2`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-meta font-medium ${headerColor} flex items-center gap-1.5`}>
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          Validação antes de salvar
        </span>
        <span className="text-meta text-muted-foreground font-mono">
          {errors.length} {errors.length === 1 ? 'erro' : 'erros'} · {warnings.length} {warnings.length === 1 ? 'aviso' : 'avisos'}
        </span>
      </div>
      <ul className="space-y-1.5">
        {errors.map((e) => (
          <IssueRow key={`${e.code}-${e.message}`} issue={e} onFix={onFix} />
        ))}
        {warnings.map((w) => (
          <IssueRow key={`${w.code}-${w.message}`} issue={w} onFix={onFix} />
        ))}
      </ul>
    </div>
  );
}
