/**
 * LocalGraphView — grafo local (radial) da nota ativa mostrando
 * backlinks (setas entrando) e wikilinks de saída (setas saindo).
 * Implementação SVG pura para evitar novas dependências.
 * Suporta filtros por tipo (nota/doc/entidade/tag) e por direção.
 */
import { useMemo, useState } from "react";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useBacklinks, useOutgoingLinks } from "@/services/notesService";
import { useNote } from "@/services/notesService";
import { FileText, Hash, Network as NetworkIcon, Users, Layers, ArrowDownRight, ArrowUpRight } from "lucide-react";

interface Node {
  id: string;
  label: string;
  kind: "self" | "note" | "document" | "entity" | "tag" | "chunk";
  direction: "in" | "out" | "self";
}

const KIND_COLOR: Record<Node["kind"], string> = {
  self: "hsl(var(--nexus-primary))",
  note: "hsl(var(--nexus-secondary))",
  document: "hsl(var(--nexus-accent))",
  entity: "hsl(var(--nexus-warning))",
  tag: "hsl(var(--muted-foreground))",
  chunk: "hsl(var(--nexus-info))",
};

const KIND_LABEL: Record<Exclude<Node["kind"], "self">, string> = {
  note: "Nota",
  document: "Documento",
  entity: "Entidade",
  tag: "Tag",
  chunk: "Chunk",
};

type KindFilter = Exclude<Node["kind"], "self">;
type DirFilter = "in" | "out";

export function LocalGraphView({ noteId }: { noteId: string }) {
  const { data: note } = useNote(noteId);
  const { data: backlinks = [] } = useBacklinks("note", noteId);
  const { data: outgoing = [] } = useOutgoingLinks(noteId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const [kindFilters, setKindFilters] = useState<Set<KindFilter>>(
    () => new Set(["note", "document", "entity", "tag", "chunk"]),
  );
  const [dirFilters, setDirFilters] = useState<Set<DirFilter>>(() => new Set(["in", "out"]));

  const allNodes: Node[] = useMemo(() => {
    const list: Node[] = [
      { id: "self", label: note?.title ?? "(nota)", kind: "self", direction: "self" },
    ];
    for (const b of backlinks) {
      if (b.source_type === "note" && b.source_id === noteId) continue;
      list.push({
        id: `in-${b.id}`,
        label: b.source_title,
        kind: b.source_type as Node["kind"],
        direction: "in",
      });
    }
    for (const o of outgoing) {
      if (o.target_type === "note" && o.target_id === noteId) continue;
      list.push({
        id: `out-${o.id}`,
        label: o.target_label ?? "(sem título)",
        kind: (o.target_type as Node["kind"]) ?? "note",
        direction: "out",
      });
    }
    return list;
  }, [note, backlinks, outgoing, noteId]);

  const nodes: Node[] = useMemo(() => {
    const filtered = allNodes.filter((n) => {
      if (n.kind === "self") return true;
      if (!kindFilters.has(n.kind)) return false;
      if (n.direction !== "self" && !dirFilters.has(n.direction as DirFilter)) return false;
      return true;
    });
    return filtered.slice(0, 25);
  }, [allNodes, kindFilters, dirFilters]);

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 120;

  const toggleKind = (k: KindFilter) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleDir = (d: DirFilter) => {
    setDirFilters((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const Filters = (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground mr-1">Filtrar:</span>
      {(Object.keys(KIND_LABEL) as KindFilter[]).map((k) => {
        const active = kindFilters.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => toggleKind(k)}
            aria-pressed={active}
            className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
              active ? "border-transparent" : "border-border/60 opacity-50 hover:opacity-80"
            }`}
            style={active ? { backgroundColor: KIND_COLOR[k], color: "hsl(var(--primary-foreground))" } : undefined}
          >
            {KIND_LABEL[k]}
          </button>
        );
      })}
      <span className="w-px h-3 bg-border/60 mx-1" />
      <button
        type="button"
        onClick={() => toggleDir("in")}
        aria-pressed={dirFilters.has("in")}
        className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors flex items-center gap-1 ${
          dirFilters.has("in") ? "bg-secondary" : "opacity-50 hover:opacity-80"
        }`}
      >
        <ArrowDownRight className="h-2.5 w-2.5" /> Entrando
      </button>
      <button
        type="button"
        onClick={() => toggleDir("out")}
        aria-pressed={dirFilters.has("out")}
        className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors flex items-center gap-1 ${
          dirFilters.has("out") ? "bg-secondary" : "opacity-50 hover:opacity-80"
        }`}
      >
        <ArrowUpRight className="h-2.5 w-2.5" /> Saindo
      </button>
    </div>
  );

  if (allNodes.length <= 1) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        <NetworkIcon className="h-6 w-6 mx-auto mb-2 opacity-40" />
        Sem links ainda. Use <code>[[Título]]</code> na nota para conectar.
      </div>
    );
  }

  if (nodes.length <= 1) {
    return (
      <div>
        {Filters}
        <div className="p-4 text-xs text-muted-foreground text-center">
          Nenhum nó com os filtros atuais.
        </div>
      </div>
    );
  }

  const peripherals = nodes.slice(1);
  const angleStep = (2 * Math.PI) / peripherals.length;

  return (
    <div>
      {Filters}
      <div className="p-3">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>
        {peripherals.map((n, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const isIn = n.direction === "in";
          return (
            <g key={n.id}>
              <line
                x1={isIn ? x : cx}
                y1={isIn ? y : cy}
                x2={isIn ? cx : x}
                y2={isIn ? cy : y}
                stroke="hsl(var(--muted-foreground) / 0.3)"
                strokeWidth={1}
                markerEnd="url(#arrow)"
              />
              <circle
                cx={x}
                cy={y}
                r={9}
                fill={KIND_COLOR[n.kind]}
                tabIndex={0}
                role="button"
                aria-label={`Abrir ${n.label}`}
                className="cursor-pointer hover:opacity-80 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary focus-visible:ring-offset-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (n.kind === "note") {
                      const src = backlinks.find((b) => `in-${b.id}` === n.id);
                      if (src) setActiveNote(src.source_id);
                    }
                  }
                }}
                onClick={() => {
                  if (n.kind === "note") {
                    const src = backlinks.find((b) => `in-${b.id}` === n.id);
                    if (src) setActiveNote(src.source_id);
                  }
                }}
              >
                <title>{n.label}</title>
              </circle>
              <text
                x={x}
                y={y + 22}
                textAnchor="middle"
                className="fill-foreground"
                style={{ fontSize: 9 }}
              >
                {n.label.length > 14 ? `${n.label.slice(0, 13)}…` : n.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={16} fill={KIND_COLOR.self} />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-primary-foreground font-bold" style={{ fontSize: 10 }}>
          Nota
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground justify-center">
        <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Documento</span>
        <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> Nota</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Entidade</span>
        <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> Tag</span>
      </div>
      </div>
    </div>
  );
}
