/**
 * Banco de Dados -- dicionario de esquema.
 *
 * O catalogo real do Postgres (schemas, tabelas e colunas, todos com
 * descricao) existe em `semantic_dictionary` desde 2026-11-24 e nunca teve
 * tela: nenhum codigo lia a tabela. Esta pagina expoe o snapshot com busca,
 * filtro por schema e por tipo de objeto.
 *
 * A leitura e restrita a admin da workspace pela policy
 * `admin_read_dictionary` (RLS), entao quem nao e admin ve estado vazio
 * explicito em vez de erro.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, BookOpen, Database, Loader2, RefreshCw, Search } from "lucide-react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  dictionaryStats,
  filterEntries,
  lastCapturedAt,
  listSchemaDictionary,
  type SchemaDictionaryEntry,
  type SchemaObjectKind,
} from "@/services/schemaDictionaryService";

const KIND_LABEL: Record<SchemaObjectKind, string> = {
  schema: "Schema",
  table: "Tabela",
  column: "Coluna",
};

const KIND_CLASS: Record<SchemaObjectKind, string> = {
  schema: "border-nexus-purple/40 text-nexus-purple",
  table: "border-nexus-emerald/40 text-nexus-emerald",
  column: "border-border/60 text-muted-foreground",
};

function StatsCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="bg-secondary/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-meta">{label}</span>
        </div>
        <p className="mt-1 text-h3 font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-meta text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function ObjectRow({ entry }: { entry: SchemaDictionaryEntry }) {
  const name =
    entry.object_kind === "column"
      ? `${entry.relation_name ?? "?"}.${entry.attribute_name ?? "?"}`
      : (entry.relation_name ?? entry.object_key);

  return (
    <div className="border-b border-border/40 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-meta ${KIND_CLASS[entry.object_kind]}`}>
          {KIND_LABEL[entry.object_kind]}
        </Badge>
        <code className="text-meta font-mono text-foreground">{name}</code>
        <span className="text-meta text-muted-foreground">{entry.schema_name}</span>
        {entry.owner_name ? (
          <span className="text-meta text-muted-foreground">· dono {entry.owner_name}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-meta text-muted-foreground">
        {entry.description?.trim() || "Sem descricao registrada."}
      </p>
    </div>
  );
}

export default function SchemaDictionaryPage() {
  const [query, setQuery] = useState("");
  const [schema, setSchema] = useState<string>("all");
  const [kind, setKind] = useState<SchemaObjectKind | "all">("all");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["schema-dictionary"],
    queryFn: listSchemaDictionary,
    staleTime: 5 * 60 * 1000,
  });

  const entries = useMemo<SchemaDictionaryEntry[]>(() => data ?? [], [data]);
  const stats = useMemo(() => dictionaryStats(entries), [entries]);
  const capturedAt = useMemo(() => lastCapturedAt(entries), [entries]);

  const schemaOptions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.schema_name) set.add(e.schema_name);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(
    () => filterEntries(entries, { schema, kind, query }),
    [entries, schema, kind, query],
  );

  const coverage =
    stats.total > 0 ? Math.round((stats.documented / stats.total) * 100) : 0;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Dicionario do Banco"
        description="Todo o catalogo de esquema com descricao -- schemas, tabelas e colunas"
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Nao foi possivel ler o dicionario</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? "Erro desconhecido."} A leitura exige permissao de admin
            da workspace.
          </AlertDescription>
        </Alert>
      ) : stats.total === 0 ? (
        <Alert>
          <BookOpen className="h-4 w-4" />
          <AlertTitle>Nenhum snapshot do catalogo</AlertTitle>
          <AlertDescription>
            A tabela <code>semantic_dictionary</code> esta vazia ou voce nao tem permissao de admin
            para le-la.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard icon={Database} label="Schemas" value={String(stats.schemas)} />
            <StatsCard icon={Database} label="Tabelas" value={String(stats.tables)} />
            <StatsCard icon={Database} label="Colunas" value={String(stats.columns)} />
            <StatsCard
              icon={BookOpen}
              label="Documentado"
              value={`${coverage}%`}
              hint={`${stats.documented} de ${stats.total} objetos`}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-h3">Objetos do esquema</CardTitle>
                <p className="text-meta text-muted-foreground">
                  {capturedAt
                    ? `Capturado ${formatDistanceToNow(new Date(capturedAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}`
                    : "Data de captura desconhecida"}
                  {" · "}
                  {filtered.length} de {stats.total} objetos
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 text-meta">Atualizar</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nome ou descricao..."
                    className="pl-8 text-meta"
                  />
                </div>
                <Select value={schema} onValueChange={setSchema}>
                  <SelectTrigger className="w-[180px] text-meta">
                    <SelectValue placeholder="Schema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os schemas</SelectItem>
                    {schemaOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={kind} onValueChange={(v) => setKind(v as SchemaObjectKind | "all")}>
                  <SelectTrigger className="w-[160px] text-meta">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="schema">Schemas</SelectItem>
                    <SelectItem value="table">Tabelas</SelectItem>
                    <SelectItem value="column">Colunas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filtered.length === 0 ? (
                <p className="py-8 text-center text-meta text-muted-foreground">
                  Nenhum objeto corresponde ao filtro.
                </p>
              ) : (
                <ScrollArea className="h-[560px] pr-3">
                  {filtered.map((entry) => (
                    <ObjectRow key={entry.id} entry={entry} />
                  ))}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}