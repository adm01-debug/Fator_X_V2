/**
 * AdvancedSearchPanel — busca DSL estilo Obsidian sobre todas as notas do
 * workspace ativo. Suporta filtros combináveis, salva queries recentes em
 * localStorage e permite abrir a nota diretamente no Workspace.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Bookmark, ChevronRight } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCerebroStore } from "@/stores/cerebroStore";
import { parseQuery, matchNote, extractTerms, type EvaluatableNote } from "@/lib/searchDsl";
import { foldForSearch } from "@/lib/normalize";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nexus.savedQueries.v1";

interface SavedQuery { name: string; query: string; }

function loadSaved(): SavedQuery[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function persistSaved(list: SavedQuery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
}

const EXAMPLES = [
  { label: "Notas de hoje", q: `created:>=${new Date().toISOString().slice(0, 10)}` },
  { label: "Sem tags", q: "-tag:*" },
  { label: "Daily notes", q: "is:daily" },
  { label: "Status: doing", q: "prop:status=doing" },
  { label: "Arquivadas", q: "is:archived" },
];

export function AdvancedSearchPanel({ onOpenNote }: { onOpenNote?: (id: string) => void }) {
  const { workspaceId } = useCurrentWorkspace();
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<SavedQuery[]>(() => loadSaved());

  useEffect(() => persistSaved(saved), [saved]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["adv-search", "notes", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseExternal
        .from("notebook_notes")
        .select("id,title,body_md,tags,created_at,updated_at,is_archived,collection_id")
        .eq("workspace_id", workspaceId as string)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as EvaluatableNote[];
    },
  });

  const parsed = useMemo(() => parseQuery(query), [query]);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return notes.filter((n) => matchNote(n, parsed)).slice(0, 200);
  }, [notes, parsed, query]);

  const terms = useMemo(() => extractTerms(parsed), [parsed]);

  function highlight(text: string): string {
    if (!terms.length) return text.slice(0, 220);
    const folded = foldForSearch(text);
    const idx = terms
      .map((t) => folded.indexOf(t))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, idx - 40);
    return (start > 0 ? "…" : "") + text.slice(start, start + 220);
  }

  function open(id: string) {
    setActiveNote(id);
    onOpenNote?.(id);
  }

  function saveCurrent() {
    if (!query.trim()) return;
    const name = window.prompt("Nome desta busca?", query.slice(0, 40));
    if (!name) return;
    setSaved((prev) => [{ name, query }, ...prev.filter((s) => s.query !== query)].slice(0, 20));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Busca avançada
            <Badge variant="outline" className="ml-2 font-normal">DSL estilo Obsidian</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Ex: tag:comercial prop:status=doing "plano de ação" -tag:draft'
                className="pr-8"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Limpar"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={saveCurrent} disabled={!query.trim()}>
              <Bookmark className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setQuery(ex.q)}
                className="px-2 py-0.5 rounded border border-border/60 bg-secondary/40 hover:bg-secondary transition"
              >
                {ex.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              {isLoading ? "Indexando…" : `${results.length} resultado(s) em ${notes.length} nota(s)`}
            </span>
            {parsed.filters.length > 0 && (
              <span>{parsed.filters.length} filtro(s) · {parsed.text.length + parsed.phrases.length} termo(s)</span>
            )}
          </div>

          <ScrollArea className="h-[52vh] pr-2">
            <ul className="space-y-1">
              {results.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded border border-border/40",
                      "hover:border-primary/40 hover:bg-secondary/40 transition group"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{n.title || "(sem título)"}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {highlight(n.body_md ?? "")}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {n.is_archived && <Badge variant="secondary" className="text-[10px]">arquivada</Badge>}
                      {n.tags?.slice(0, 6).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">#{t}</Badge>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
              {!isLoading && query.trim() && results.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma nota bate com esta consulta.
                </li>
              )}
              {!query.trim() && (
                <li className="text-sm text-muted-foreground text-center py-8">
                  Digite uma consulta ou clique em um exemplo acima.
                </li>
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Sintaxe suportada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p><code className="text-foreground">tag:foo</code> — nota com tag</p>
          <p><code className="text-foreground">-tag:draft</code> — nega o filtro</p>
          <p><code className="text-foreground">title:"reunião"</code> — no título</p>
          <p><code className="text-foreground">body:roadmap</code> — no corpo</p>
          <p><code className="text-foreground">prop:status=doing</code> — frontmatter</p>
          <p><code className="text-foreground">created:&gt;=2026-07-01</code> — data</p>
          <p><code className="text-foreground">is:archived</code> / <code className="text-foreground">is:daily</code></p>
          <p><code className="text-foreground">"frase exata"</code></p>

          {saved.length > 0 && (
            <div className="pt-3 mt-2 border-t border-border/50">
              <p className="text-foreground font-medium mb-1.5">Buscas salvas</p>
              <ul className="space-y-1">
                {saved.map((s, i) => (
                  <li key={s.name + i} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuery(s.query)}
                      className="flex-1 text-left px-2 py-1 rounded hover:bg-secondary/60 text-foreground truncate"
                      title={s.query}
                    >
                      {s.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${s.name}`}
                      onClick={() => setSaved((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
