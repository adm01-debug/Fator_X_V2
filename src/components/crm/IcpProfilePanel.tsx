/**
 * IcpProfilePanel — edição do Perfil de Cliente Ideal (ICP).
 *
 * Os pesos são salvos crus (podem somar qualquer valor); a normalização vive
 * no motor de score, para que ajustar um critério não force rebalancear todos.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Save, Target } from 'lucide-react';
import {
  ensureDefaultIcpProfile,
  updateIcpProfile,
  type IcpProfile,
} from '@/services/crmScoringService';
import { LeadScoreSimulator } from './LeadScoreSimulator';

const WEIGHTS = [
  { key: 'weight_industry', label: 'Setor' },
  { key: 'weight_company_size', label: 'Porte da empresa' },
  { key: 'weight_job_title', label: 'Cargo' },
  { key: 'weight_engagement', label: 'Engajamento' },
] as const;

function toList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function IcpProfilePanel() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<IcpProfile | null>(null);

  const profileQuery = useQuery({
    queryKey: ['crm', 'icp-profile'],
    queryFn: ensureDefaultIcpProfile,
    staleTime: 60_000,
  });

  // Sincroniza o rascunho quando o perfil carrega ou é invalidado.
  useEffect(() => {
    if (profileQuery.data) setDraft(profileQuery.data);
  }, [profileQuery.data]);

  const save = useMutation({
    mutationFn: async (profile: IcpProfile) => {
      // A constraint do banco exige hot >= qualificado; barramos antes do 400.
      if (profile.hot_threshold < profile.qualified_threshold) {
        throw new Error('O limiar "quente" precisa ser maior ou igual ao "qualificado".');
      }
      await updateIcpProfile(profile.id, {
        name: profile.name,
        weight_industry: profile.weight_industry,
        weight_company_size: profile.weight_company_size,
        weight_job_title: profile.weight_job_title,
        weight_engagement: profile.weight_engagement,
        target_industries: profile.target_industries,
        target_job_titles: profile.target_job_titles,
        min_company_size: profile.min_company_size,
        max_company_size: profile.max_company_size,
        qualified_threshold: profile.qualified_threshold,
        hot_threshold: profile.hot_threshold,
      });
    },
    onSuccess: () => {
      toast({ title: 'Perfil de ICP salvo', description: 'Os próximos scores usarão estes critérios.' });
      queryClient.invalidateQueries({ queryKey: ['crm', 'icp-profile'] });
    },
    onError: (error: unknown) =>
      toast({
        title: 'Falha ao salvar ICP',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      }),
  });

  if (profileQuery.isLoading || !draft) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (profileQuery.error) {
    return (
      <Card>
        <CardContent className="p-6 text-body-sm text-destructive">
          Falha ao carregar o perfil de ICP:{' '}
          {profileQuery.error instanceof Error ? profileQuery.error.message : 'erro desconhecido'}
        </CardContent>
      </Card>
    );
  }

  const patch = (p: Partial<IcpProfile>) => setDraft((prev) => (prev ? { ...prev, ...p } : prev));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-body">
            <Target className="h-4 w-4 text-primary" aria-hidden="true" />
            Perfil de Cliente Ideal
          </CardTitle>
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending} className="gap-2">
            <Save className="h-4 w-4" aria-hidden="true" />
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="icp-name">Nome do perfil</Label>
            <Input id="icp-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>

          <fieldset className="space-y-4">
            <legend className="text-body-sm font-medium text-foreground">Pesos dos critérios</legend>
            {WEIGHTS.map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between text-body-sm">
                  <Label htmlFor={`icp-${key}`}>{label}</Label>
                  <span className="tabular-nums text-muted-foreground">{draft[key]}</span>
                </div>
                <Slider
                  id={`icp-${key}`}
                  value={[draft[key]]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => patch({ [key]: v } as Partial<IcpProfile>)}
                  aria-label={`Peso de ${label}`}
                />
              </div>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="icp-industries">Setores-alvo (separados por vírgula)</Label>
            <Input
              id="icp-industries"
              value={draft.target_industries.join(', ')}
              onChange={(e) => patch({ target_industries: toList(e.target.value) })}
              placeholder="Tecnologia, Saúde, Varejo"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="icp-titles">Cargos-alvo (separados por vírgula)</Label>
            <Input
              id="icp-titles"
              value={draft.target_job_titles.join(', ')}
              onChange={(e) => patch({ target_job_titles: toList(e.target.value) })}
              placeholder="Diretor, Head, CEO"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="icp-min">Porte mínimo</Label>
              <Input
                id="icp-min"
                type="number"
                min={0}
                value={draft.min_company_size ?? ''}
                onChange={(e) =>
                  patch({ min_company_size: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icp-max">Porte máximo</Label>
              <Input
                id="icp-max"
                type="number"
                min={0}
                value={draft.max_company_size ?? ''}
                onChange={(e) =>
                  patch({ max_company_size: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icp-qualified">Limiar qualificado</Label>
              <Input
                id="icp-qualified"
                type="number"
                min={0}
                max={100}
                value={draft.qualified_threshold}
                onChange={(e) => patch({ qualified_threshold: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icp-hot">Limiar quente</Label>
              <Input
                id="icp-hot"
                type="number"
                min={0}
                max={100}
                value={draft.hot_threshold}
                onChange={(e) => patch({ hot_threshold: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <LeadScoreSimulator profile={draft} />
    </div>
  );
}
