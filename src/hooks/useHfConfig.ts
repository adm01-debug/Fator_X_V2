/**
 * useHfConfig — configuração HuggingFace do workspace (leitura + gravação).
 *
 * A RLS de `hf_config` já limita a escrita a `workspace_admin`; a tela esconde o botão
 * para quem não é admin, mas a autorização real é do banco.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { getHfConfig, saveHfConfig, type HfConfig } from '@/services/hfConfigService';

export function useHfConfig(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['hf_config', workspaceId],
    queryFn: () => getHfConfig(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });
}

export function useSaveHfConfig(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<HfConfig>) => saveHfConfig(workspaceId as string, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hf_config', workspaceId] });
      toast.success('Configuração HuggingFace salva');
    },
    onError: (error: unknown) => {
      logger.error(
        `Falha ao salvar hf_config: ${error instanceof Error ? error.message : String(error)}`,
      );
      toast.error('Não foi possível salvar a configuração');
    },
  });
}
