/**
 * CadencesPanel — Gestão de cadências de follow-up.
 *
 * Deliberadamente separa "quem entra" (inscrição por faixa de score) de
 * "quando sai" (runner). O operador enxerga o lote previsto antes de qualquer
 * disparo real, porque uma cadência mal configurada não tem desfazer: a
 * mensagem já saiu.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CadenceStepsEditor } from '@/components/crm/CadenceStepsEditor';
import { Play, PlayCircle, Plus, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createCadence,
  enrollDealsByTier,
  listCadences,
  listEnrollments,
  runCadences,
  stopEnrollment,
  updateCadence,
} from '@/services/crmCadenceService';
// Fonte única das faixas: duplicar rótulos aqui abriria divergência com o
// scoring assim que uma faixa nova entrar.
import { TIER_LABELS as TIER_LABEL, type LeadTier } from '@/services/crmScoringService';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  completed: 'Concluída',
  stopped: 'Interrompida',
  failed: 'Falhou',
};

export function CadencesPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [tier, setTier] = useState<LeadTier>('hot');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cadencesQuery = useQuery({ queryKey: ['crm', 'cadences'], queryFn: listCadences });
  const enrollmentsQuery = useQuery({
    queryKey: ['crm', 'enrollments', selectedId],
    queryFn: () => listEnrollments(selectedId ?? undefined),
  });

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['crm', 'cadences'] });
    queryClient.invalidateQueries({ queryKey: ['crm', 'enrollments'] });
  };

  const notifyError = (title: string) => (error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message : String(error),
      variant: 'destructive',
    });

  const create = useMutation({
    mutationFn: () => createCadence({ name: name.trim(), trigger_tier: tier }),
    onSuccess: (cadence) => {
      setName('');
      setSelectedId(cadence.id);
      refetchAll();
      toast({ title: 'Cadência criada', description: cadence.name });
    },
    onError: notifyError('Falha ao criar cadência'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCadence(id, { is_active: isActive }),
    onSuccess: refetchAll,
    onError: notifyError('Falha ao alterar cadência'),
  });

  const enroll = useMutation({
    mutationFn: ({ id, target }: { id: string; target: LeadTier }) => enrollDealsByTier(id, target),
    onSuccess: (result) => {
      refetchAll();
      toast({
        title: `${result.enrolled} negócio(s) inscrito(s)`,
        description: `Elegíveis: ${result.eligible} · já ativos: ${result.skippedAlreadyActive} · opt-out: ${result.skippedOptedOut}`,
      });
    },
    onError: notifyError('Falha ao inscrever negócios'),
  });

  const run = useMutation({
    mutationFn: (dryRun: boolean) => runCadences({ dryRun }),
    onSuccess: (summary, dryRun) => {
      refetchAll();
      toast({
        title: dryRun ? 'Simulação concluída' : 'Cadências executadas',
        description: `Selecionados: ${summary.claimed} · enviados: ${summary.sent} · concluídos: ${summary.completed} · interrompidos: ${summary.stopped} · falhas: ${summary.failed} · adiados por teto diário: ${summary.capped}`,
      });
    },
    onError: notifyError('Falha ao executar cadências'),
  });

  const stop = useMutation({
    mutationFn: (id: string) => stopEnrollment(id),
    onSuccess: refetchAll,
    onError: notifyError('Falha ao interromper inscrição'),
  });

  const cadences = cadencesQuery.data ?? [];
  const selected = cadences.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova cadência</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="cadence-name">Nome</Label>
            <Input
              id="cadence-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Follow-up leads quentes"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cadence-tier">Faixa-alvo</Label>
            <Select value={tier} onValueChange={(v) => setTier(v as LeadTier)}>
              <SelectTrigger id="cadence-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIER_LABEL) as LeadTier[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {TIER_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="gap-2"
            onClick={() => create.mutate()}
            disabled={create.isPending || name.trim().length < 3}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Criar
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => run.mutate(true)}
          disabled={run.isPending}
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Simular execução
        </Button>
        <Button className="gap-2" onClick={() => run.mutate(false)} disabled={run.isPending}>
          <Play className="h-4 w-4" aria-hidden="true" />
          Executar agora
        </Button>
      </div>

      {cadencesQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : cadences.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-body-sm text-muted-foreground">
            Nenhuma cadência criada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <ul className="space-y-2">
            {cadences.map((cadence) => (
              <li key={cadence.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(cadence.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    selectedId === cadence.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{cadence.name}</span>
                    <Badge variant={cadence.is_active ? 'default' : 'secondary'}>
                      {cadence.is_active ? 'Ativa' : 'Pausada'}
                    </Badge>
                  </div>
                  {cadence.trigger_tier && (
                    <span className="text-caption text-muted-foreground">
                      Faixa: {TIER_LABEL[cadence.trigger_tier]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-4">
            {selected ? (
              <>
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <CardTitle className="truncate">{selected.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cadence-active" className="text-caption">
                        Ativa
                      </Label>
                      <Switch
                        id="cadence-active"
                        checked={selected.is_active}
                        onCheckedChange={(checked) =>
                          toggleActive.mutate({ id: selected.id, isActive: checked })
                        }
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <CadenceStepsEditor cadenceId={selected.id} />
                    <Button
                      variant="outline"
                      onClick={() =>
                        enroll.mutate({
                          id: selected.id,
                          target: selected.trigger_tier ?? 'hot',
                        })
                      }
                      disabled={enroll.isPending}
                    >
                      Inscrever negócios da faixa{' '}
                      {TIER_LABEL[selected.trigger_tier ?? 'hot'].toLowerCase()}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Inscrições</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {enrollmentsQuery.isLoading && <Skeleton className="h-24 w-full" />}
                    {(enrollmentsQuery.data ?? []).map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {STATUS_LABEL[enrollment.status] ?? enrollment.status}
                            </Badge>
                            <span className="text-caption text-muted-foreground">
                              passo {enrollment.current_step + 1}
                            </span>
                          </div>
                          <p className="truncate text-caption text-muted-foreground">
                            Próximo envio:{' '}
                            {new Date(enrollment.next_run_at).toLocaleString('pt-BR')}
                          </p>
                          {enrollment.last_error && (
                            <p className="truncate text-caption text-destructive">
                              {enrollment.last_error}
                            </p>
                          )}
                        </div>
                        {enrollment.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Interromper inscrição"
                            onClick={() => stop.mutate(enrollment.id)}
                            disabled={stop.isPending}
                          >
                            <StopCircle className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {!enrollmentsQuery.isLoading && (enrollmentsQuery.data ?? []).length === 0 && (
                      <p className="text-body-sm text-muted-foreground">
                        Nenhuma inscrição nesta cadência.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-6 text-body-sm text-muted-foreground">
                  Selecione uma cadência para editar os passos.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
