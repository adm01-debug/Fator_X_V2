/**
 * AccountLockoutsPanel ? bloqueios de login ativos (account_lockouts).
 *
 * Os bloqueios são criados por `check_auth_security` durante o login, antes
 * de existir JWT ? por isso a leitura passa por uma RPC SECURITY DEFINER com
 * guard de administrador do workspace. Sem este painel, um usuário bloqueado
 * ficaria preso sem que ninguém pudesse liberá-lo.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Loader2, RefreshCw, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listAccountLockouts, releaseAccountLockout } from '@/services/accountLockoutService';
import { cn } from '@/lib/utils';

function formatWhen(iso: string | null): string {
  if (!iso) return '?';
  return new Date(iso).toLocaleString('pt-BR');
}

export function AccountLockoutsPanel({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const [releasing, setReleasing] = useState<string | null>(null);

  const { data: lockouts = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['account_lockouts', workspaceId],
    queryFn: () => listAccountLockouts(workspaceId as string),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const handleRelease = async (id: string, email: string | null) => {
    setReleasing(id);
    try {
      await releaseAccountLockout(id);
      toast.success(`Bloqueio de ${email ?? 'origem desconhecida'} liberado`);
      await queryClient.invalidateQueries({ queryKey: ['account_lockouts', workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao liberar bloqueio');
    } finally {
      setReleasing(null);
    }
  };

  if (!workspaceId) return null;

  return (
    <div className="nexus-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-body-sm font-heading font-semibold text-foreground flex items-center gap-2">
          <Lock className="h-4 w-4 text-nexus-amber" /> Bloqueios de Login
          {lockouts.length > 0 && (
            <Badge variant="outline" className="text-meta">
              {lockouts.length}
            </Badge>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Recarregar bloqueios"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando?
        </div>
      ) : error ? (
        <p className="text-body-sm text-muted-foreground">
          Sem permissão para ver os bloqueios: requer administrador do workspace.
        </p>
      ) : lockouts.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          Nenhum bloqueio ativo. Tentativas de login acima do limite aparecem aqui.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {lockouts.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-foreground truncate">
                  {l.email ?? l.ip_address ?? 'origem desconhecida'}
                </p>
                <p className="text-meta text-muted-foreground">
                  {l.lockout_type === 'permanent' ? 'Permanente' : 'Temporário'} ·{' '}
                  {l.failure_count} falha{l.failure_count === 1 ? '' : 's'} · bloqueado em{' '}
                  {formatWhen(l.locked_at)}
                  {l.expires_at && !l.unlocked_at ? ` · expira em ${formatWhen(l.expires_at)}` : ''}
                  {l.unlocked_at ? ` · liberado em ${formatWhen(l.unlocked_at)}` : ''}
                </p>
              </div>
              {!l.unlocked_at && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRelease(l.id, l.email)}
                  disabled={releasing === l.id}
                >
                  {releasing === l.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unlock className="h-4 w-4" />
                  )}
                  <span className="ml-1">Liberar</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
