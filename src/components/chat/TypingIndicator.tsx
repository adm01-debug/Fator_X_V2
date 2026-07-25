/**
 * TypingIndicator — 3 dots animados no estilo "digitando..." do WhatsApp.
 */
export function TypingIndicator({ label = 'digitando' }: { label?: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-2xl bg-muted/80 backdrop-blur-sm border border-border/50 px-3.5 py-2.5"
      aria-label={`Agente ${label}`}
    >
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
      </span>
      <span className="text-meta text-muted-foreground">{label}…</span>
    </div>
  );
}
