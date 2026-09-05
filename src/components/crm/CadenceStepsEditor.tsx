/**
 * CadenceStepsEditor — Passos de uma cadência.
 *
 * A posição é derivada da ordem da lista, nunca digitada: o banco tem
 * UNIQUE(cadence_id, position) e deixar o usuário escolher o número
 * transformaria uma reordenação trivial em erro de constraint.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';
import {
  deleteCadenceStep,
  listCadenceSteps,
  upsertCadenceStep,
  type CadenceChannel,
} from '@/services/crmCadenceService';

const CHANNEL_LABEL: Record<CadenceChannel, string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  task: 'Tarefa',
};

export interface CadenceStepsEditorProps {
  cadenceId: string;
}

export function CadenceStepsEditor({ cadenceId }: CadenceStepsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<CadenceChannel>('email');
  const [delayHours, setDelayHours] = useState('24');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const stepsQuery = useQuery({
    queryKey: ['crm', 'cadence-steps', cadenceId],
    queryFn: () => listCadenceSteps(cadenceId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['crm', 'cadence-steps', cadenceId] });

  const addStep = useMutation({
    mutationFn: async () => {
      const steps = stepsQuery.data ?? [];
      const nextPosition = steps.length === 0 ? 0 : Math.max(...steps.map((s) => s.position)) + 1;
      const parsedDelay = Number(delayHours);
      await upsertCadenceStep(cadenceId, {
        position: nextPosition,
        channel,
        // Atraso inválido vira o padrão de 24h em vez de estourar o CHECK do banco.
        delay_hours:
          Number.isFinite(parsedDelay) && parsedDelay >= 0 ? Math.floor(parsedDelay) : 24,
        subject: subject.trim() || null,
        body: body.trim(),
      });
    },
    onSuccess: () => {
      setSubject('');
      setBody('');
      invalidate();
      toast({ title: 'Passo adicionado' });
    },
    onError: (error: unknown) =>
      toast({
        title: 'Falha ao adicionar passo',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      }),
  });

  const removeStep = useMutation({
    mutationFn: (id: string) => deleteCadenceStep(id),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Passo removido' });
    },
  });

  if (stepsQuery.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const steps = stepsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{index + 1}</Badge>
                <Badge variant="outline">{CHANNEL_LABEL[step.channel]}</Badge>
                <span className="text-caption text-muted-foreground">após {step.delay_hours}h</span>
              </div>
              {step.subject && <p className="text-body-sm font-medium">{step.subject}</p>}
              <p className="text-body-sm text-muted-foreground line-clamp-2">{step.body}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover passo ${index + 1}`}
              onClick={() => removeStep.mutate(step.id)}
              disabled={removeStep.isPending}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
        {steps.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-4 text-body-sm text-muted-foreground">
            Nenhum passo ainda. Uma cadência sem passos nunca envia nada.
          </li>
        )}
      </ol>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cadence-channel">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as CadenceChannel)}>
              <SelectTrigger id="cadence-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CHANNEL_LABEL) as CadenceChannel[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CHANNEL_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cadence-delay">Atraso (horas)</Label>
            <Input
              id="cadence-delay"
              type="number"
              min={0}
              value={delayHours}
              onChange={(e) => setDelayHours(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadence-subject">Assunto (opcional)</Label>
          <Input
            id="cadence-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadence-body">Mensagem</Label>
          <Textarea
            id="cadence-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Olá {{primeiro_nome}}, sobre {{negocio}} na {{empresa}}…"
          />
          <p className="text-caption text-muted-foreground">
            Variáveis: {'{{contato}}'}, {'{{primeiro_nome}}'}, {'{{empresa}}'}, {'{{negocio}}'}
          </p>
        </div>
        <Button
          onClick={() => addStep.mutate()}
          disabled={addStep.isPending || body.trim().length === 0}
          className="gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar passo
        </Button>
      </div>
    </div>
  );
}
