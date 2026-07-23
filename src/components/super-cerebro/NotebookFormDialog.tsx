import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NOTEBOOK_ICONS, NOTEBOOK_PALETTE, type Notebook, type NotebookInput } from "@/services/notebooksService";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Notebook | null;
  onSubmit: (input: NotebookInput) => Promise<void> | void;
  submitting?: boolean;
}

export function NotebookFormDialog({ open, onOpenChange, initial, onSubmit, submitting }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("BookOpen");
  const [color, setColor] = useState("nexus-primary");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setIcon(initial?.icon ?? "BookOpen");
      setColor(initial?.color ?? "nexus-primary");
    }
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), description: description.trim() || null, icon, color });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar notebook" : "Novo notebook temático"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nb-name">Nome</Label>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Comercial" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nb-desc">Descrição (opcional)</Label>
            <Textarea id="nb-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              placeholder="Para que serve este notebook?" />
          </div>

          <div className="space-y-1.5">
            <Label>Ícone</Label>
            <div className="grid grid-cols-6 gap-2">
              {NOTEBOOK_ICONS.map((n) => {
                const Ic = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[n] ?? Icons.BookOpen;
                return (
                  <button key={n} type="button" onClick={() => setIcon(n)}
                    className={cn(
                      "aspect-square rounded-lg border flex items-center justify-center transition-colors",
                      icon === n ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/50",
                    )}>
                    <Ic className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {NOTEBOOK_PALETTE.map((p) => (
                <button key={p.value} type="button" onClick={() => setColor(p.value)}
                  title={p.name}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                    color === p.value ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ background: `hsl(var(--${p.value}))` }} />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? "Salvando…" : initial ? "Salvar" : "Criar notebook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
