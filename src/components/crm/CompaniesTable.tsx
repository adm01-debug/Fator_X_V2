import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { Building2 } from 'lucide-react';
import type { CrmCompany, CompanySizeBand } from '@/services/crmService';

interface CompaniesTableProps {
  companies: CrmCompany[];
  isLoading: boolean;
  onSelect?: (company: CrmCompany) => void;
}

const SIZE_LABEL: Record<CompanySizeBand, string> = {
  micro: 'Micro',
  small: 'Pequena',
  medium: 'Média',
  large: 'Grande',
  enterprise: 'Enterprise',
};

export function CompaniesTable({ companies, isLoading, onSelect }: CompaniesTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhuma empresa cadastrada"
        description="Empresas são criadas pela sincronização com o Bitrix24 ou pelo enriquecimento de leads."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Domínio</TableHead>
            <TableHead>Setor</TableHead>
            <TableHead>Porte</TableHead>
            <TableHead className="text-right">Score ICP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow
              key={company.id}
              className="cursor-pointer"
              onClick={() => onSelect?.(company)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect?.(company);
              }}
            >
              <TableCell className="font-medium">{company.name}</TableCell>
              <TableCell className="text-muted-foreground">{company.domain ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{company.industry ?? '—'}</TableCell>
              <TableCell>
                {company.size_band ? (
                  <Badge variant="secondary">{SIZE_LABEL[company.size_band]}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {company.icp_score === null ? '—' : company.icp_score.toFixed(0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
