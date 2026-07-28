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
import {
  AlertTriangle,
  Download,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  departmentLabel,
  SKILL_DEPARTMENTS,
  type SkillDepartment,
} from '@/config/skill-departments';
import { fetchSkillDemand } from '@/services/skillDemandService';
import {
  countByDepartment,
  countBySource,
  DEMAND_SEARCH_MAX,
  DEMAND_TIERS,
  DEMAND_TIER_LABEL,
  DEPARTMENT_SOURCE_LABEL,
  DEPARTMENT_SOURCES,
  demandRowsToCsv,
  filterByDemand,
  filterByDepartment,
  filterBySource,
  normalizeSourceFilter,

  filterByNeedsReview,
  countNeedsReview,
  normalizeDemandFilter,
  normalizeDemandPreferences,
  normalizeDepartmentFilter,
  summarizeSkillDemand,
  type DemandPreferences,
  type DemandTier,
  type SkillDemandRow,
} from '@/lib/skills/skillDemand';
import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { SkillReclassifyDialog } from '@/components/skills/SkillReclassifyDialog';
import { SkillClassificationEfficacyCard } from '@/components/skills/SkillClassificationEfficacyCard';

import { SkillReclassificationReviewPanel } from '@/components/skills/SkillReclassificationReviewPanel';
import { SkillDescriptionEnrichPanel } from '@/components/skills/SkillDescriptionEnrichPanel';
import {
  MIN_RECLASSIFY_CONFIDENCE,
  type ReclassifyCandidate,
} from '@/lib/skills/departmentReclassification';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const TIER_STYLE: Record<DemandTier, string> = {
  zero: 'border-destructive/40 text-destructive',
  baixa: 'border-warning/40 text-warning',
  media: 'border-primary/40 text-primary',
  alta: 'border-success/40 text-success',
};

const DEPARTAMENTOS = [...SKILL_DEPARTMENTS];

const PREFS_PADRAO: DemandPreferences = {
  tier: 'zero',
  department: 'all',
  search: '',
  confidenceThreshold: MIN_RECLASSIFY_CONFIDENCE,
  onlyNeedsReview: false,
  source: 'all',
};


export function SkillDemandPanel() {
  const [rows, setRows] = useState<SkillDemandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reclassificarAberto, setReclassificarAberto] = useState(false);
  /** Dispara o lote de IA assim que o diálogo abrir (atalho "Sem depto."). */
  const [autoIa, setAutoIa] = useState(false);
  /** Aguardando o recorte "Sem depto." ser aplicado para então abrir a IA. */
  const [iaPendente, setIaPendente] = useState(false);


  const { filters: prefsBrutas, setFilters: setPrefs, clearAll } = useFilterPersistence<
    Record<string, unknown>
  >({
    scope: 'skill_demand',
    defaults: PREFS_PADRAO as unknown as Record<string, unknown>,
    storageKey: 'nexus.skillDemand.filters',
  });

  /**
   * O hook faz spread cego do payload remoto sobre os defaults; qualquer valor
   * corrompido ou de taxonomia antiga viraria um recorte vazio permanente.
   * Sanitizamos a cada render — barato e totalmente defensivo.
   */
  const {
    tier: filter,
    department: deptFilter,
    search,
    confidenceThreshold,
    onlyNeedsReview,
    source: sourceFilter,
  } = useMemo(

    () => normalizeDemandPreferences(prefsBrutas, DEPARTAMENTOS, PREFS_PADRAO),
    [prefsBrutas],
  );

  const atualizarPrefs = useCallback(
    (patch: Partial<DemandPreferences>) => {
      setPrefs((prev) => ({
        ...normalizeDemandPreferences(prev, DEPARTAMENTOS, PREFS_PADRAO),
        ...patch,
      }));
    },
    [setPrefs],
  );


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

  /**
   * Abre o diálogo com auto-disparo apenas DEPOIS que o recorte "Sem depto."
   * está de fato em vigor — abrir antes classificaria o filtro anterior.
   */
  useEffect(() => {
    if (!iaPendente || loading) return;
    if (deptFilter !== 'none') return;
    setIaPendente(false);
    setAutoIa(true);
    setReclassificarAberto(true);
  }, [iaPendente, loading, deptFilter]);

  const resumo = useMemo(() => summarizeSkillDemand(rows), [rows]);
  const porDepartamento = useMemo(() => countByDepartment(rows), [rows]);
  const pendentesRevisao = useMemo(() => countNeedsReview(rows), [rows]);
  const porOrigem = useMemo(() => countBySource(rows), [rows]);

  const visiveis = useMemo(() => {
    const termo = search.trim().toLowerCase();
    const porFaixa = filterBySource(
      filterByNeedsReview(
        filterByDepartment(filterByDemand(rows, filter), deptFilter),
        onlyNeedsReview,
      ),
      sourceFilter,
    );
    if (!termo) return porFaixa;
    return porFaixa.filter(
      (row) =>
        row.name.toLowerCase().includes(termo) ||
        row.slug.toLowerCase().includes(termo) ||
        (row.sourceRepo ?? '').toLowerCase().includes(termo),
    );
  }, [rows, filter, deptFilter, search, onlyNeedsReview, sourceFilter]);


  /** O recorte visível é exatamente o universo oferecido à reclassificação. */
  const candidatos = useMemo<ReclassifyCandidate[]>(
    () =>
      visiveis.map((row) => ({
        skillId: row.skillId,
        name: row.name,
        slug: row.slug,
        description: row.description,
        tags: row.tags,
        department: row.department,
      })),
    [visiveis],
  );

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
    <div className="space-y-6">
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
              onClick={() => setReclassificarAberto(true)}
              disabled={loading || candidatos.length === 0}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Reclassificar
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
            onValueChange={(value) => atualizarPrefs({ tier: normalizeDemandFilter(value) })}
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
          <Select
            value={deptFilter}
            onValueChange={(value) =>
              atualizarPrefs({ department: normalizeDepartmentFilter(value, DEPARTAMENTOS) })
            }
          >
            <SelectTrigger className="w-[220px]" aria-label="Filtrar por departamento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os departamentos</SelectItem>
              <SelectItem value="none">
                Sem departamento ({porDepartamento.none ?? 0})
              </SelectItem>
              {SKILL_DEPARTMENTS.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {departmentLabel(dept)} ({porDepartamento[dept] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Procedência: separa léxico, tier de plataforma, IA e curadoria
              humana. Opções com contagem zero continuam listadas (desabilitá-las
              esconderia que a origem existe e nunca produziu nada). */}
          <Select
            value={sourceFilter}
            onValueChange={(value) => atualizarPrefs({ source: normalizeSourceFilter(value) })}
          >
            <SelectTrigger className="w-[210px]" aria-label="Filtrar por origem da classificação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {DEPARTMENT_SOURCES.map((origem) => (
                <SelectItem key={origem} value={origem}>
                  {DEPARTMENT_SOURCE_LABEL[origem]} ({porOrigem[origem] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="flex-1 min-w-[220px]"
            placeholder="Buscar por nome, slug ou repositório de origem"
            value={search}
            maxLength={DEMAND_SEARCH_MAX}
            onChange={(event) => atualizarPrefs({ search: event.target.value })}
            aria-label="Buscar skills"
          />
          <Button
            variant={onlyNeedsReview ? 'default' : 'outline'}
            size="sm"
            onClick={() => atualizarPrefs({ onlyNeedsReview: !onlyNeedsReview })}
            disabled={!onlyNeedsReview && pendentesRevisao === 0}
            aria-pressed={onlyNeedsReview}
            title="Mostra apenas rótulos automáticos de baixa confiança, que ainda não passaram por curadoria humana"
          >
            <AlertTriangle className="h-4 w-4 mr-2" aria-hidden />
            Rever depto. ({pendentesRevisao})
          </Button>
          {/* Fila própria: skills sem departamento nunca entram no selo "Rever
              depto." (não há rótulo automático para duvidar) e o tier padrão
              'zero' esconde as que têm demanda. Este atalho monta o recorte
              completo em um clique. */}
          <Button
            variant={deptFilter === 'none' ? 'default' : 'outline'}
            size="sm"
            onClick={() =>
              atualizarPrefs(
                deptFilter === 'none'
                  ? { department: PREFS_PADRAO.department, tier: PREFS_PADRAO.tier }
                  : { department: 'none', tier: 'all', onlyNeedsReview: false },
              )
            }
            disabled={deptFilter !== 'none' && (porDepartamento.none ?? 0) === 0}
            aria-pressed={deptFilter === 'none'}
            title="Skills importadas que ficaram sem departamento — fora do selo de revisão por construção"
          >
            <HelpCircle className="h-4 w-4 mr-2" aria-hidden />
            Sem depto. ({porDepartamento.none ?? 0})
          </Button>

          {/* Consequência direta da fila acima: skills sem departamento não têm
              evidência léxica (por isso ficaram sem rótulo), então o único
              caminho automático restante é o fallback LLM. O atalho troca o
              recorte E abre o diálogo já disparando o lote — as propostas
              continuam nascendo desmarcadas, nada é escrito sem curadoria. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (deptFilter === 'none') {
                setAutoIa(true);
                setReclassificarAberto(true);
                return;
              }
              // Troca o recorte primeiro: abrir agora usaria os candidatos do
              // filtro ANTERIOR e gastaria créditos no lote errado.
              atualizarPrefs({ department: 'none', tier: 'all', onlyNeedsReview: false });
              setIaPendente(true);
            }}
            disabled={loading || (porDepartamento.none ?? 0) === 0}
            title="Envia as skills sem departamento para classificação por IA em lote"
          >
            <Sparkles className="h-4 w-4 mr-2" aria-hidden />
            Sugerir depto. com IA
          </Button>



          <Button
            variant="ghost"
            size="sm"
            onClick={() => void clearAll()}
            disabled={
              filter === PREFS_PADRAO.tier &&
              deptFilter === PREFS_PADRAO.department &&
              search === '' &&
              onlyNeedsReview === PREFS_PADRAO.onlyNeedsReview
            }
          >
            Limpar filtros
          </Button>
        </div>


        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="text-body-sm text-muted-foreground py-8 text-center">
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
                    <p className="text-body-sm font-medium truncate">{row.name}</p>
                    <p className="text-meta text-muted-foreground truncate">
                      {row.slug}
                      {row.sourceRepo ? ` · ${row.sourceRepo}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.department && (
                      <Badge variant="secondary" className="text-meta">
                        {departmentLabel(row.department as SkillDepartment)}
                      </Badge>
                    )}
                    {row.departmentNeedsReview && (
                      <Badge
                        variant="outline"
                        className="text-meta border-nexus-amber/60 text-nexus-amber"
                        title={`Classificacao ${row.departmentSource} com confianca ${row.departmentConfidence.toFixed(2)} — revise antes de confiar no rotulo`}
                      >
                        Rever depto.
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-meta">
                      Q{row.qualityScore}
                    </Badge>
                    <Badge variant="outline" className={cn('text-meta', TIER_STYLE[row.tier])}>
                      {row.templateCount} template{row.templateCount === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>

      <SkillReclassifyDialog
        open={reclassificarAberto}
        onOpenChange={(aberto) => {
          setReclassificarAberto(aberto);
          // Fechar encerra a intenção de auto-disparo; reabrir manualmente
          // não pode gastar créditos sem o curador pedir.
          if (!aberto) setAutoIa(false);
        }}
        autoRunLlm={autoIa}
        candidates={candidatos}
        confidenceThreshold={confidenceThreshold}
        onConfidenceThresholdChange={(v) => atualizarPrefs({ confidenceThreshold: v })}
        onApplied={() => void carregar()}
      />

    </Card>

    {/* Fila de aprovação: fica logo abaixo porque é a consequência direta de
        "Enviar para revisão" — esconder em outra tela quebraria o fluxo. */}
    <SkillReclassificationReviewPanel onApproved={() => void carregar()} />

    {/* Consequência de segunda ordem das decisões acima: sem medir a eficácia
        do classificador, cada ajuste de limiar seria chute. */}
    <SkillClassificationEfficacyCard
      currentThreshold={confidenceThreshold}
      onApplyThreshold={(v) => atualizarPrefs({ confidenceThreshold: v })}
    />



    {/* Mesma família de problema (skill importada que o catálogo não expõe),
        então mora ao lado da demanda em vez de virar mais uma tela. */}
    <SkillDescriptionEnrichPanel onApplied={() => void carregar()} />
    </div>
  );
}
