import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  detectKnowledgeDecay,
  archiveDecayedItems,
  type DecayItem,
  type DecayLevel,
} from "@/services/knowledgeDecayService";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Clock,
  AlertTriangle,
  Archive,
  RefreshCw,
  Trash2,
  Info,
} from "lucide-react";

const LEVEL_META: Record<
  DecayLevel,
  { label: string; icon: typeof Sparkles; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  fresh: {
    label: "Fresco",
    icon: Sparkles,
    variant: "outline",
    className: "text-nexus-emerald border-nexus-emerald/40",
  },
  review: {
    label: "Revisar",
    icon: Clock,
    variant: "outline",
    className: "text-nexus-amber border-nexus-amber/40",
  },
  refresh: {
    label: "Atualizar",
    icon: RefreshCw,
    variant: "outline",
    className: "text-nexus-orange border-nexus-orange/40",
  },
  archive: {
    label: "Arquivar",
    icon: Archive,
    variant: "outline",
    className: "text-destructive border-destructive/40",
  },
};

export default function KnowledgeDecayPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [levelFilter, setLevelFilter] = useState<DecayLevel | "all">("all");
  const [limit, setLimit] = useState<number>(200);

  const decayQuery = useQuery({
    queryKey: ["knowledge-decay", limit],
    queryFn: () => detectKnowledgeDecay(limit),
    staleTime: 60_000,
  });

  const archiveMutation = useMutation({
    mutationFn: (ids: string[]) => archiveDecayedItems(ids),
    onSuccess: (count) => {
      toast.success(`${count} item(s) arquivado(s) com sucesso`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["knowledge-decay"] });
    },
    onError: (error: Error) => {
      toast.error(`Falha ao arquivar: ${error.message}`);
    },
  });

  const report = decayQuery.data;
  const items: DecayItem[] = report?.items ?? [];
  const filtered = items.filter((i) => levelFilter === "all" || i.level === levelFilter);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((i) => i.id)));
    }
  };

  const selectAllArchivable = () => {
    setSelected(new Set(items.filter((i) => i.level === "archive").map((i) => i.id)));
  };

  const totals = {
    fresh: report?.fresh_count ?? 0,
    review: report?.review_count ?? 0,
    refresh: report?.refresh_count ?? 0,
    archive: report?.archive_count ?? 0,
  };
  const total = report?.total_scanned ?? 0;
  const healthy = total === 0 ? 0 : Math.round(((totals.fresh + totals.review) / total) * 100);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Decaimento de Conhecimento"
        description="Detecte, revise e arquive memórias e artefatos que perderam relevância ao longo do tempo."
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {(["fresh", "review", "refresh", "archive"] as DecayLevel[]).map((lvl) => {
          const meta = LEVEL_META[lvl];
          const Icon = meta.icon;
          const value = totals[lvl];
          return (
            <Card key={lvl}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {meta.label}
                </CardTitle>
                <Icon className={`h-4 w-4 ${meta.className.split(" ")[0]}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "0%"} do total
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saúde geral do conhecimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {total} item(s) escaneados • {healthy}% saudável
            </span>
            <span className="font-medium">{healthy}%</span>
          </div>
          <Progress value={healthy} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Itens detectados</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as DecayLevel | "all")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filtrar por nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                <SelectItem value="fresh">Fresco</SelectItem>
                <SelectItem value="review">Revisar</SelectItem>
                <SelectItem value="refresh">Atualizar</SelectItem>
                <SelectItem value="archive">Arquivar</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Limite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100 itens</SelectItem>
                <SelectItem value="200">200 itens</SelectItem>
                <SelectItem value="500">500 itens</SelectItem>
                <SelectItem value="1000">1000 itens</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => decayQuery.refetch()}
              disabled={decayQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${decayQuery.isFetching ? "animate-spin" : ""}`}
              />
              Reanalisar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={selectAllArchivable}
              disabled={totals.archive === 0}
            >
              Selecionar arquiváveis
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => archiveMutation.mutate([...selected])}
              disabled={selected.size === 0 || archiveMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Arquivar ({selected.size})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {decayQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhum item encontrado</AlertTitle>
              <AlertDescription>
                {total === 0
                  ? "Ainda não há memórias registradas para análise de decaimento."
                  : "Nenhum item corresponde ao filtro selecionado."}
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-[520px] pr-4">
              <div className="flex items-center gap-2 pb-3 border-b mb-3">
                <Checkbox
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm text-muted-foreground">
                  Selecionar todos os {filtered.length} itens visíveis
                </span>
              </div>
              <div className="space-y-2">
                {filtered.map((item) => {
                  const meta = LEVEL_META[item.level];
                  const Icon = meta.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {item.name || "(sem título)"}
                          </span>
                          <Badge variant={meta.variant} className={meta.className}>
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            decay {item.decay_score}
                          </Badge>
                        </div>
                        {item.content_preview && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.content_preview}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{item.age_days} dias</span>
                          {item.importance !== null && (
                            <span>Relevância: {item.importance.toFixed(2)}</span>
                          )}
                          <span className="italic">{item.recommendation}</span>
                        </div>
                      </div>
                      {item.level === "archive" && (
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
