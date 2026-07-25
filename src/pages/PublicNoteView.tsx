/**
 * PublicNoteView — página pública read-only exibindo um snapshot de nota
 * codificado no fragmento da URL (`/share/n#<payload>`). Sem auth, sem
 * chamadas ao backend — o conteúdo vem inteiramente do hash.
 */
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FileText, Clock, ShieldAlert } from "lucide-react";
import { decodeSnapshot, type NoteSnapshot } from "@/services/shareService";
import { renderWikilinksToMarkdown } from "@/lib/wikilink";

export default function PublicNoteView() {
  const [snap, setSnap] = useState<NoteSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
      setError("Nenhum conteúdo compartilhado nesta URL.");
      setLoading(false);
      return;
    }
    (async () => {
      const s = await decodeSnapshot(hash);
      if (!s) setError("Link inválido, corrompido ou incompatível.");
      setSnap(s);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (snap?.title) document.title = `${snap.title} · Nexus Share`;
  }, [snap?.title]);

  const rendered = useMemo(
    () => (snap ? renderWikilinksToMarkdown(snap.body_md, () => null) : ""),
    [snap]
  );

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </main>
    );
  }

  if (error || !snap) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md p-6 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-destructive" aria-hidden />
          <h1 className="text-title-sm font-semibold">Não foi possível abrir este link</h1>
          <p className="text-body-sm text-muted-foreground">{error ?? "Payload ausente."}</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-secondary/20">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 text-meta text-muted-foreground mb-2">
            <FileText className="h-3.5 w-3.5" />
            <span>Snapshot público · read-only</span>
            <span className="mx-1">·</span>
            <Clock className="h-3.5 w-3.5" />
            <time dateTime={snap.publishedAt}>
              {new Date(snap.publishedAt).toLocaleString("pt-BR")}
            </time>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{snap.title || "(sem título)"}</h1>
          {snap.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {snap.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-meta">#{t}</Badge>
              ))}
            </div>
          )}
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-6 py-8 prose prose-sm dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rendered}</ReactMarkdown>
      </article>
      <footer className="max-w-3xl mx-auto px-6 py-6 text-meta text-muted-foreground border-t border-border/50">
        Este conteúdo foi publicado como snapshot estático. Alterações na nota original não são refletidas aqui.
      </footer>
    </main>
  );
}
