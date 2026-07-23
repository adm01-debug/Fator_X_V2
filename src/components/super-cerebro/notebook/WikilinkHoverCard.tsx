/**
 * WikilinkHoverCard — preview flutuante ao passar o mouse sobre `[[link]]`
 * renderizado no preview markdown. Estilo Obsidian "Page Preview".
 */
import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { supabaseExternal } from "@/integrations/supabase/externalClient";
import { FileText, Loader2 } from "lucide-react";
import { useCerebroStore } from "@/stores/cerebroStore";

interface Props {
  label: string;
  targetType: "note" | "document" | "entity" | "tag";
  children: React.ReactNode;
}

interface Preview {
  id: string | null;
  title: string;
  snippet: string;
}

export function WikilinkHoverCard({ label, targetType, children }: Props) {
  const activeNotebookId = useCerebroStore((s) => s.activeNotebookId);
  const setActiveNote = useCerebroStore((s) => s.setActiveNote);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      if (targetType === "note" && activeNotebookId) {
        const { data } = await supabaseExternal
          .from("notebook_notes")
          .select("id,title,body_md")
          .eq("collection_id", activeNotebookId)
          .ilike("title", label)
          .limit(1)
          .maybeSingle();
        if (data) {
          const body = ((data as { body_md?: string }).body_md ?? "").replace(/[#*`>[\]]/g, "").trim();
          setPreview({
            id: (data as { id: string }).id,
            title: (data as { title: string }).title,
            snippet: body.slice(0, 240) + (body.length > 240 ? "…" : ""),
          });
        } else {
          setPreview({ id: null, title: label, snippet: "Nota ainda não existe. Clique para criar." });
        }
      } else if (targetType === "document") {
        const { data } = await supabaseExternal
          .from("documents")
          .select("id,title")
          .ilike("title", `%${label}%`)
          .limit(1)
          .maybeSingle();
        setPreview({
          id: (data?.id as string | undefined) ?? null,
          title: (data?.title as string | undefined) ?? label,
          snippet: data ? "Documento indexado no notebook." : "Documento não encontrado.",
        });
      } else {
        setPreview({ id: null, title: label, snippet: `Tipo: ${targetType}` });
      }
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const openNote = () => {
    if (preview?.id && targetType === "note") setActiveNote(preview.id);
  };

  return (
    <HoverCard openDelay={220} closeDelay={80}>
      <HoverCardTrigger asChild onMouseEnter={load} onFocus={load}>
        <button
          type="button"
          onClick={openNote}
          className="cursor-pointer text-nexus-primary underline decoration-dotted underline-offset-2 hover:decoration-solid bg-transparent border-0 p-0"
          aria-label={preview?.title ? `Abrir nota ${preview.title}` : "Abrir nota"}
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80 text-meta">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-3.5 w-3.5 text-nexus-primary" />
          <span className="font-semibold truncate">{preview?.title ?? label}</span>
        </div>
        {loading ? (
          <span className="text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </span>
        ) : (
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {preview?.snippet ?? "—"}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
