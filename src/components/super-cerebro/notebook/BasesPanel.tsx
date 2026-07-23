/**
 * BasesPanel — visão tabular estilo Obsidian Bases.
 *
 * Permite ao usuário construir tabelas dinâmicas sobre as notas do
 * notebook ativo, filtrando/ordenando por frontmatter e salvando views.
 */
import { useEffect, useMemo, useState } from "react";
import {
  applyView,
  BUILTIN_COLUMNS,
  defaultView,
  getCell,
  loadViews,
  saveViews,
  useBaseRows,
  type BaseView,
  type FilterRule,
  type Operator,
  type SortDir,
} from "@/services/basesService";
import { useCerebroStore } from "@/stores/cerebroStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Table as TableIcon, Filter, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

const OPERATORS: { value: Operator; label: string; needsValue: boolean }[] = [
  { value: "eq", label: "igual a", needsValue: true },
  { value: "ne", label: "diferente de", needsValue: true },
  { value: "contains", label: "contém", needsValue: true },
  { value: "in", label: "está em (a,b,c)", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: "≥", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "≤", needsValue: true },
  { value: "exists", label: "existe", needsValue: false },
  { value: "not_exists", label: "não existe", needsValue: false },
];

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleString("pt-BR");
  }
  return String(v);
}

interface Props {
  onOpenNote?: (id: string) => void;
}

export function BasesPanel({ onOpenNote }: Props) {
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const { rows, dynamicColumns, isLoading } = useBaseRows(activeNotebookId);

  const [views, setViews] = useState<BaseView[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Carrega views ao trocar notebook
  useEffect(() => {
    if (!activeNotebookId) return;
    const list = loadViews(activeNotebookId);
    if (list.length === 0) {
      const v = defaultView();
      setViews([v]);
      setCurrentId(v.id);
    } else {
      setViews(list);
      setCurrentId(list[0].id);
    }
  }, [activeNotebookId]);

  const current = useMemo(
    () => views.find((v) => v.id === currentId) ?? null,
    [views, currentId],
  );

  const allColumns = useMemo(
    () => Array.from(new Set([...BUILTIN_COLUMNS, ...dynamicColumns])),
    [dynamicColumns],
  );

  const filteredRows = useMemo(
    () => (current ? applyView(rows, current) : []),
    [rows, current],
  );

  function updateCurrent(patch: Partial<BaseView>) {
    if (!current) return;
    setViews((prev) => prev.map((v) => (v.id === current.id ? { ...v, ...patch } : v)));
  }

  function persist() {
    if (!activeNotebookId) return;
    saveViews(activeNotebookId, views);
    toast.success("Views salvas");
  }

  function addView() {
    const v = defaultView();
    setViews((prev) => [...prev, v]);
    setCurrentId(v.id);
  }

  function removeView() {
    if (!current) return;
    if (views.length === 1) {
      toast.error("Mantenha ao menos uma view.");
      return;
    }
    const next = views.filter((v) => v.id !== current.id);
    setViews(next);
    setCurrentId(next[0]?.id ?? null);
  }

  function toggleColumn(col: string) {
    if (!current) return;
    const has = current.columns.includes(col);
    const next = has ? current.columns.filter((c) => c !== col) : [...current.columns, col];
    updateCurrent({ columns: next });
  }

  function addFilter() {
    if (!current) return;
    const rule: FilterRule = { column: "title", op: "contains", value: "" };
    updateCurrent({ filters: [...current.filters, rule] });
  }

  function updateFilter(idx: number, patch: Partial<FilterRule>) {
    if (!current) return;
    const next = current.filters.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    updateCurrent({ filters: next });
  }

  function removeFilter(idx: number) {
    if (!current) return;
    updateCurrent({ filters: current.filters.filter((_, i) => i !== idx) });
  }

  function handleOpen(id: string) {
    setActiveNote(id);
    onOpenNote?.(id);
  }

  if (!activeNotebookId) {
    return <p className="text-sm text-muted-foreground p-6">Selecione um notebook para usar Bases.</p>;
  }
  if (isLoading || !current) {
    return <p className="text-sm text-muted-foreground p-6">Carregando…</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header: seletor de view + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <TableIcon className="h-4 w-4 text-muted-foreground" />
        <Select value={current.id} onValueChange={setCurrentId}>
          <SelectTrigger className="w-[220px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {views.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-8 max-w-[220px]"
          value={current.name}
          onChange={(e) => updateCurrent({ name: e.target.value })}
          aria-label="Nome da view"
        />
        <Button size="sm" variant="outline" onClick={addView}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova view
        </Button>
        <Button size="sm" variant="outline" onClick={removeView}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
        </Button>
        <Button size="sm" onClick={persist}>
          <Save className="h-3.5 w-3.5 mr-1" /> Salvar
        </Button>
        <Badge variant="secondary" className="ml-auto">{filteredRows.length} linhas</Badge>
      </div>

      {/* Colunas + ordenação */}
      <div className="rounded-md border border-border/60 p-3 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Colunas visíveis</Label>
          <div className="flex flex-wrap gap-1.5">
            {allColumns.map((col) => {
              const active = current.columns.includes(col);
              return (
                <Button
                  key={col}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => toggleColumn(col)}
                >
                  {col}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground">Ordenar por</Label>
          <Select
            value={current.sortBy ?? "__none__"}
            onValueChange={(v) => updateCurrent({ sortBy: v === "__none__" ? null : v })}
          >
            <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— nenhum —</SelectItem>
              {allColumns.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={current.sortDir} onValueChange={(v) => updateCurrent({ sortDir: v as SortDir })}>
            <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Crescente</SelectItem>
              <SelectItem value="desc">Decrescente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-md border border-border/60 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground">Filtros (AND)</Label>
          <Button size="sm" variant="outline" className="h-7 ml-auto" onClick={addFilter}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar filtro
          </Button>
        </div>
        {current.filters.length === 0 && (
          <p className="text-xs text-muted-foreground">Sem filtros — todas as notas do notebook.</p>
        )}
        {current.filters.map((rule, i) => {
          const opMeta = OPERATORS.find((o) => o.value === rule.op);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={rule.column} onValueChange={(v) => updateFilter(i, { column: v })}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allColumns.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={rule.op} onValueChange={(v) => updateFilter(i, { op: v as Operator })}>
                <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {opMeta?.needsValue && (
                <Input
                  className="h-8 flex-1 min-w-[160px]"
                  value={String(rule.value ?? "")}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  placeholder="valor"
                />
              )}
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeFilter(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Tabela */}
      <div className="rounded-md border border-border/60 overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader>
            <TableRow>
              {current.columns.map((c) => (
                <TableHead key={c} className="text-xs whitespace-nowrap">{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => handleOpen(row.id)}
              >
                {current.columns.map((c) => (
                  <TableCell key={c} className="text-xs align-top max-w-[280px] truncate">
                    {formatCell(getCell(row, c))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {filteredRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={current.columns.length} className="text-center text-xs text-muted-foreground py-6">
                  Nenhuma linha corresponde aos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
