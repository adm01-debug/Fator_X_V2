import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { LeadScoreBadge } from './LeadScoreBadge';
import { Briefcase } from 'lucide-react';
import { formatCurrency, type CrmDeal, type CrmStage } from '@/services/crmService';

interface DealsTableProps {
  deals: CrmDeal[];
  stages: CrmStage[];
  isLoading: boolean;
  onSelect?: (deal: CrmDeal) => void;
  onCreate?: () => void;
}

const STATUS_LABEL: Record<CrmDeal['status'], string> = {
  open: 'Aberto',
  won: 'Ganho',
  lost: 'Perdido',
};

const STATUS_VARIANT: Record<CrmDeal['status'], 'default' | 'secondary' | 'destructive'> = {
  open: 'secondary',
  won: 'default',
  lost: 'destructive',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function DealsTable({ deals, stages, isLoading, onSelect, onCreate }: DealsTableProps) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Nenhum negócio ainda"
        description="Crie um negócio manualmente ou sincronize com o Bitrix24 para popular o funil."
        actionLabel={onCreate ? 'Novo negócio' : undefined}
        onAction={onCreate}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Negócio</TableHead>
            <TableHead>Estágio</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Fechamento previsto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => (
            <TableRow
              key={deal.id}
              className="cursor-pointer"
              onClick={() => onSelect?.(deal)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect?.(deal);
              }}
            >
              <TableCell className="font-medium">{deal.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {deal.stage_id ? (stageName.get(deal.stage_id) ?? '—') : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(deal.amount, deal.currency)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[deal.status]}>{STATUS_LABEL[deal.status]}</Badge>
              </TableCell>
              <TableCell>
                <LeadScoreBadge score={deal.lead_score} scoreReason={deal.score_reason} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(deal.expected_close_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
