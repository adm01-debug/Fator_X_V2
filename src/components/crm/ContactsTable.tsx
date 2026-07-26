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
import { Users } from 'lucide-react';
import type { CrmContact, CrmCompany } from '@/services/crmService';

interface ContactsTableProps {
  contacts: CrmContact[];
  companies: CrmCompany[];
  isLoading: boolean;
  onSelect?: (contact: CrmContact) => void;
}

export function ContactsTable({
  contacts,
  companies,
  isLoading,
  onSelect,
}: ContactsTableProps) {
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum contato cadastrado"
        description="Contatos aparecem aqui após a sincronização com o Bitrix24 ou importação manual."
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Contato permitido</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => (
            <TableRow
              key={contact.id}
              className="cursor-pointer"
              onClick={() => onSelect?.(contact)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect?.(contact);
              }}
            >
              <TableCell className="font-medium">{contact.full_name}</TableCell>
              <TableCell className="text-muted-foreground">
                {contact.company_id ? (companyName.get(contact.company_id) ?? '—') : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{contact.job_title ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
              <TableCell>
                {contact.opted_out ? (
                  <Badge variant="destructive">Opt-out</Badge>
                ) : (
                  <Badge variant="secondary">Sim</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
