/**
 * CrmPage — Vendas (Fase 1 do Sales Automation).
 *
 * Lista negócios, contatos e empresas do modelo canônico `crm_*`, com resumo
 * de funil calculado a partir da probabilidade de cada estágio.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrmSummaryCards } from '@/components/crm/CrmSummaryCards';
import { DealsTable } from '@/components/crm/DealsTable';
import { ContactsTable } from '@/components/crm/ContactsTable';
import { CompaniesTable } from '@/components/crm/CompaniesTable';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from '@/hooks/use-toast';
import { Search, Layers } from 'lucide-react';
import {
  listDeals,
  listStages,
  listContacts,
  listCompanies,
  ensureDefaultPipeline,
  summarizeDeals,
  type DealStatus,
} from '@/services/crmService';

export default function CrmPage() {
  const [tab, setTab] = useState('deals');
  const [status, setStatus] = useState<DealStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const queryClient = useQueryClient();

  const stagesQuery = useQuery({
    queryKey: ['crm', 'stages'],
    queryFn: () => listStages(),
    staleTime: 60_000,
  });

  const dealsQuery = useQuery({
    queryKey: ['crm', 'deals', status, debouncedSearch],
    queryFn: () => listDeals({ status, search: debouncedSearch || undefined }),
    staleTime: 30_000,
  });

  const contactsQuery = useQuery({
    queryKey: ['crm', 'contacts', debouncedSearch],
    queryFn: () => listContacts(debouncedSearch || undefined),
    enabled: tab === 'contacts',
    staleTime: 30_000,
  });

  const companiesQuery = useQuery({
    queryKey: ['crm', 'companies', debouncedSearch],
    queryFn: () => listCompanies(debouncedSearch || undefined),
    staleTime: 30_000,
  });

  const seedPipeline = useMutation({
    mutationFn: ensureDefaultPipeline,
    onSuccess: () => {
      toast({ title: 'Funil padrão pronto', description: 'Estágios criados com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (error: unknown) =>
      toast({
        title: 'Falha ao criar funil',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      }),
  });

  const deals = useMemo(() => dealsQuery.data ?? [], [dealsQuery.data]);
  const stages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  const summary = useMemo(() => summarizeDeals(deals, stages), [deals, stages]);

  const errorMessage =
    dealsQuery.error instanceof Error
      ? dealsQuery.error.message
      : stagesQuery.error instanceof Error
        ? stagesQuery.error.message
        : null;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Vendas"
        description="Funil comercial nativo do Nexus — negócios, contatos e empresas espelhados do Bitrix24 e prontos para automação com agentes."
        actions={
          stages.length === 0 ? (
            <Button
              onClick={() => seedPipeline.mutate()}
              disabled={seedPipeline.isPending}
              className="gap-2"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Criar funil padrão
            </Button>
          ) : undefined
        }
      />

      {errorMessage && (
        <Card>
          <CardContent className="p-6 text-body-sm text-destructive">
            Falha ao carregar dados de vendas: {errorMessage}
          </CardContent>
        </Card>
      )}

      <CrmSummaryCards summary={summary} isLoading={dealsQuery.isLoading} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            aria-label="Buscar registros de vendas"
            className="pl-9"
          />
        </div>
        {tab === 'deals' && (
          <Select value={status} onValueChange={(v) => setStatus(v as DealStatus | 'all')}>
            <SelectTrigger className="sm:w-48" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="open">Abertos</SelectItem>
              <SelectItem value="won">Ganhos</SelectItem>
              <SelectItem value="lost">Perdidos</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="deals">Negócios</TabsTrigger>
          <TabsTrigger value="contacts">Contatos</TabsTrigger>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
        </TabsList>

        <TabsContent value="deals">
          <DealsTable
            deals={deals}
            stages={stages}
            isLoading={dealsQuery.isLoading}
            onCreate={() => seedPipeline.mutate()}
          />
        </TabsContent>

        <TabsContent value="contacts">
          <ContactsTable
            contacts={contactsQuery.data ?? []}
            companies={companiesQuery.data ?? []}
            isLoading={contactsQuery.isLoading}
          />
        </TabsContent>

        <TabsContent value="companies">
          <CompaniesTable
            companies={companiesQuery.data ?? []}
            isLoading={companiesQuery.isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
