/**
 * SkillDemandPanel — mede quantos templates de agente consomem cada skill do
 * Registry e destaca as de DEMANDA ZERO (nunca recomendadas a nenhum agente).
 *
 * Serve à curadoria: skills sem demanda geralmente têm tags pobres ou
 * departamento errado; o painel dá o recorte e exporta CSV para o trabalho
 * offline de reescrita.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, RefreshCw, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { departmentLabel, type SkillDepartment } from '@/config/skill-departments';
import { fetchSkillDemand } from '@/services/skillDemandService';
import {
  DEMAND_TIERS,
  DEMAND_TIER_LABEL,
  demandRowsToCsv,
  filterByDemand,
  normalizeDemandFilter,
  summarizeSkillDemand,
  type DemandFilter,
  type DemandTier,
  type SkillDemandRow,
} from '@/lib/skills/skillDemand';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const TIER_STYLE: Record<DemandTier, string> = {
  zero: 'border-destructive/40 text-destructive',
  baixa: 'border-warning/40 text-warning',
  media: 'border-primary/40 text-primary',
  alta: 'border-success/40 text-success',
};

export function SkillDemandPanel() {
  const [rows, setRows] = useState<SkillDemandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DemandFilter>('zero');
  const [search, setSearch] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchSkillDemand());
    } catch (error) {
      logger.error('fetchSkillDemand failed', { error: (error as Error).message });
      toast.error('Não foi possível carregar a demanda das skills.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = useMemo(() => summarizeSkillDemand(rows), [rows]);

  const visiveis = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const porFaixa = filterByDemand(rows, filter);
    if (!termo) return porFaixa;
    return porFaixa.filter(
      (row) =>
        row.name.toLowerCase().includes(termo) ||
        row.slug.toLowerCase().includes(termo) ||
        (row.sourceRepo ?? '').toLowerCase().includes(termo),
    );
  }, [rows, filter, search]);

  const exportarCsv = useCallback(() => {
    const blob = new Blob([demandRowsToCsv(visiveis)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `demanda-skills-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [visiveis]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              Demanda de skills
            </CardTitle>
            <CardDescription>
              Quantos templates de agente consomem cada skill do catálogo. Demanda zero indica
              tags pobres ou departamento incorreto.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void carregar()}
              disabled={loading}
              aria-label="Recarregar demanda"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportarCsv}
              disabled={visiveis.length === 0}
              aria-label="Exportar recorte em CSV"
            >
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline">{resumo.total} skills</Badge>
          <Badge variant="outline">{resumo.coveragePct}% com demanda</Badge>
          {DEMAND_TIERS.map((tier) => (
            <Badge key={tier} variant="outline" className={cn(TIER_STYLE[tier])}>
              {DEMAND_TIER_LABEL[tier]}: {resumo.byTier[tier]}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={filter}
            onValueChange={(value) => setFilter(normalizeDemandFilter(value))}
          >
            <SelectTrigger className="w-[200px]" aria-label="Filtrar por faixa de demanda">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as faixas</SelectItem>
              {DEMAND_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {DEMAND_TIER_LABEL[tier]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="flex-1 min-w-[220px]"
            placeholder="Buscar por nome, slug ou repositório de origem"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar skills"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {rows.length === 0
              ? 'Nenhuma skill no catálogo ainda.'
              : 'Nenhuma skill nesse recorte — ajuste o filtro ou a busca.'}
          </p>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <ul className="space-y-2">
              {visiveis.map((row) => (
                <li
                  key={row.skillId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.slug}
                      {row.sourceRepo ? ` · ${row.sourceRepo}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.department && (
                      <Badge variant="secondary" className="text-[11px]">
                        {departmentLabel(row.department as SkillDepartment)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[11px]">
                      Q{row.qualityScore}
                    </Badge>
                    <Badge variant="outline" className={cn('text-[11px]', TIER_STYLE[row.tier])}>
                      {row.templateCount} template{row.templateCount === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
