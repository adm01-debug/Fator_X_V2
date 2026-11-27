import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CONSENT_LABELS,
  REQUIRED_CONSENTS,
  listMyConsents,
  setMyConsent,
  type ConsentType,
} from '@/services/consentService';

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

interface ConsentPanelProps {
  workspaceId: string | null;
}

export function ConsentPanel({ workspaceId }: ConsentPanelProps) {
  const queryClient = useQueryClient();

  const consents = useQuery({
    queryKey: ['lgpd_consents', workspaceId],
    queryFn: () => listMyConsents(workspaceId),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: (input: { consentType: ConsentType; granted: boolean }) =>
      setMyConsent({ ...input, workspaceId }),
    onSuccess: (_data, input) => {
      toast.success(
        input.granted
          ? 'Consentimento registrado'
          : 'Consentimento revogado',
      );
      void queryClient.invalidateQueries({ queryKey: ['lgpd_consents'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Nao foi possivel registrar o consentimento');
    },
  });

  const byType = new Map((consents.data ?? []).map((c) => [c.consent_type, c]));
  const types = Object.keys(CONSENT_LABELS) as ConsentType[];

  return (
    <div className="space-y-3">
      <div className="nexus-card space-y-1">
        <h3 className="text-body-sm font-semibold text-foreground">Seus consentimentos</h3>
        <p className="text-meta text-muted-foreground">
          Art. 8 da LGPD. Revogar aqui nao apaga o historico: o registro fica
          com a data de revogacao para prova de conformidade.
        </p>
      </div>

      {consents.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : consents.error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-meta text-destructive">Nao foi possivel carregar seus consentimentos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((type) => {
            const record = byType.get(type);
            const granted = record?.granted ?? false;
            const required = REQUIRED_CONSENTS.includes(type);
            const isSaving = toggle.isPending && toggle.variables?.consentType === type;

            return (
              <div
                key={type}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-secondary/30 p-3"
              >
                <div className="flex-1 min-w-[220px]">
                  <p className="text-meta font-medium text-foreground">{CONSENT_LABELS[type]}</p>
                  <p className="text-meta text-muted-foreground/60">
                    {record
                      ? granted
                        ? `Concedido em ${formatDate(record.granted_at)} (v${record.version})`
                        : `Revogado em ${formatDate(record.revoked_at)} (v${record.version})`
                      : 'Ainda nao registrado'}
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className={
                    granted
                      ? 'border-nexus-emerald/40 text-nexus-emerald'
                      : 'border-border/40 text-muted-foreground'
                  }
                >
                  {granted ? 'Concedido' : 'Nao concedido'}
                </Badge>

                <Button
                  size="sm"
                  variant={granted ? 'outline' : 'default'}
                  className="gap-1"
                  disabled={isSaving || (required && granted)}
                  title={
                    required && granted
                      ? 'Consentimento essencial: revogar exige encerrar a conta'
                      : undefined
                  }
                  onClick={() => toggle.mutate({ consentType: type, granted: !granted })}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : granted ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {granted ? 'Revogar' : 'Conceder'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
