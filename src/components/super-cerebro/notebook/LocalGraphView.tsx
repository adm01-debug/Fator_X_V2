/**
 * LocalGraphView — grafo local (radial) da nota ativa mostrando
 * backlinks (setas entrando) e wikilinks de saída (setas saindo).
 * Implementação SVG pura para evitar novas dependências.
 */
import { useMemo } from "react";
import { useCerebroStore } from "@/stores/cerebroStore";
import { useBacklinks, useOutgoingLinks } from "@/services/notesService";
import { useNote } from "@/services/notesService";
import { FileText, Hash, Network as NetworkIcon, Users, Layers } from "lucide-react";

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

export function LocalGraphView({ noteId }: { noteId: string }) {
  const { data: note } = useNote(noteId);
  const { data: backlinks = [] } = useBacklinks("note", noteId);
  const { data: outgoing = [] } = useOutgoingLinks(noteId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);

  const nodes: Node[] = useMemo(() => {
    const list: Node[] = [
      { id: "self", label: note?.title ?? "(nota)", kind: "self", direction: "self" },
    ];
    for (const b of backlinks) {
      // Filtra self-links: uma nota que aparece linkando pra si mesma não vira nó peripheral.
      if (b.source_type === "note" && b.source_id === noteId) continue;
      list.push({
        id: `in-${b.id}`,
        label: b.source_title,
        kind: b.source_type as Node["kind"],
        direction: "in",
      });
    }
    for (const o of outgoing) {
      // Filtra self-links de saída (target apontando pra própria nota).
      if (o.target_type === "note" && o.target_id === noteId) continue;
      list.push({
        id: `out-${o.id}`,
        label: o.target_label ?? "(sem título)",
        kind: (o.target_type as Node["kind"]) ?? "note",
        direction: "out",
      });
    }
    return list.slice(0, 25); // cap visual
  }, [note, backlinks, outgoing, noteId]);

  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 120;

  if (nodes.length <= 1) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        <NetworkIcon className="h-6 w-6 mx-auto mb-2 opacity-40" />
        Sem links ainda. Use <code>[[Título]]</code> na nota para conectar.
      </div>
    );
  }

  const peripherals = nodes.slice(1);
  const angleStep = (2 * Math.PI) / peripherals.length;

  return (
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
                className="cursor-pointer hover:opacity-80 transition-opacity"
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
  );
}
