/**
 * PropertiesPanel — exibe e edita frontmatter YAML da nota ativa
 * (estilo Obsidian Properties). Suporta strings, números, booleans e listas.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  parseFrontmatter,
  upsertFrontmatter,
  type FrontmatterValue,
} from "@/lib/frontmatter";
import { useNote, useUpdateNote } from "@/services/notesService";

interface Props {
  noteId: string;
  collectionId: string;
}

function displayValue(v: FrontmatterValue): string {
  if (v === null) return "";
  if (Array.isArray(v)) return v.map((x) => (x === null ? "" : String(x))).join(", ");
  return String(v);
}

function parseInput(raw: string): FrontmatterValue {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
  return s;
}

export function PropertiesPanel({ noteId, collectionId }: Props) {
  const { data: note, isLoading } = useNote(noteId);
  const update = useUpdateNote(collectionId);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const parsed = useMemo(() => parseFrontmatter(note?.body_md ?? ""), [note?.body_md]);
  const entries = useMemo(() => Object.entries(parsed.data).sort(([a], [b]) => a.localeCompare(b)), [parsed.data]);

  if (isLoading || !note) {
    return (
      <div className="p-3 text-meta text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
      </div>
    );
  }

  const savePatch = async (patch: Record<string, FrontmatterValue>, marker: string) => {
    setSaving(marker);
    try {
      const nextBody = upsertFrontmatter(note.body_md, patch);
      await update.mutateAsync({ id: note.id, patch: { body_md: nextBody }, syncLinks: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar propriedade");
    } finally {
      setSaving(null);
    }
  };

  const handleAdd = async () => {
    const key = newKey.trim();
    if (!key) return;
    if (!/^[A-Za-z_][\w-]*$/.test(key)) {
      toast.error("Chave inválida — use letras, dígitos, _ ou -");
      return;
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
      toast.error("Propriedade já existe");
      return;
    }
    await savePatch({ [key]: "" }, `add:${key}`);
    setNewKey("");
  };

  const handleRemove = async (key: string) => {
    const next = { ...parsed.data };
    delete next[key];
    // upsert com o objeto reconstruído completo requer regenerar frontmatter — usamos truque:
    // limpar via stringify indireto: substituímos escrevendo o body inteiro sem o campo.
    setSaving(`del:${key}`);
    try {
      // Reconstroi frontmatter sem a chave, preservando corpo
      const { body } = parseFrontmatter(note.body_md);
      const rebuilt = upsertFrontmatter(body, next);
      await update.mutateAsync({ id: note.id, patch: { body_md: rebuilt }, syncLinks: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover propriedade");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-meta font-semibold uppercase text-muted-foreground tracking-wide">
          Properties
        </p>
        <Badge variant="outline" className="text-[9px]">
          {parsed.present ? "YAML frontmatter" : "sem frontmatter"}
        </Badge>
      </div>

      {entries.length === 0 && (
        <p className="text-meta text-muted-foreground">
          Nenhuma propriedade. Adicione campos como <code>status</code>, <code>due</code>, <code>tags</code>.
        </p>
      )}

      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-meta font-medium text-nexus-primary w-28 truncate" title={key}>
              {key}
            </span>
            <Input
              defaultValue={displayValue(value)}
              onBlur={(e) => {
                const next = parseInput(e.currentTarget.value);
                if (JSON.stringify(next) === JSON.stringify(value)) return;
                void savePatch({ [key]: next }, `edit:${key}`);
              }}
              className="h-7 text-meta"
              placeholder="valor"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive shrink-0"
              disabled={saving === `del:${key}`}
              onClick={() => void handleRemove(key)}
              aria-label={`Remover ${key}`}
            >
              {saving === `del:${key}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          placeholder="nova_propriedade"
          className="h-7 text-meta"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          disabled={!newKey.trim() || saving?.startsWith("add:")}
          onClick={() => void handleAdd()}
        >
          {saving?.startsWith("add:") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Adicionar
        </Button>
      </div>

      <p className="text-meta text-muted-foreground">
        Dica: use listas separando por vírgula. Booleans (<code>true</code>/<code>false</code>) e números são detectados automaticamente.
      </p>
    </div>
  );
}
