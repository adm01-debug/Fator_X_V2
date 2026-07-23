/**
 * EditorAutocomplete — popover ancorado ao caret do textarea do NoteEditor
 * para sugerir notas ao digitar `[[…` e tags ao digitar `#…`.
 * Navegação por teclado: ↑/↓ + Enter/Tab para aceitar, Esc para fechar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { foldForSearch } from "@/lib/normalize";
import type { NotebookNote } from "@/services/notesService";

export type AutocompleteMode = "wikilink" | "tag";

interface Props {
  textarea: HTMLTextAreaElement | null;
  value: string;
  notes: NotebookNote[];
  onInsert: (text: string, replaceStart: number, replaceEnd: number) => void;
}

interface Trigger {
  mode: AutocompleteMode;
  start: number; // posição inclusiva do gatilho ([[ ou #)
  end: number;   // posição atual do caret
  query: string;
}

function detectTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(0, caret);
  const wl = before.lastIndexOf("[[");
  if (wl !== -1) {
    const inner = before.slice(wl + 2);
    if (!/[\]\n]/.test(inner)) {
      return { mode: "wikilink", start: wl, end: caret, query: inner };
    }
  }
  const hash = before.lastIndexOf("#");
  if (hash !== -1) {
    const prev = hash === 0 ? " " : before[hash - 1];
    const inner = before.slice(hash + 1);
    if (/^[\s(]$/.test(prev) && /^[\w-]*$/.test(inner)) {
      return { mode: "tag", start: hash, end: caret, query: inner };
    }
  }
  return null;
}

export function EditorAutocomplete({ textarea, value, notes, onInsert }: Props) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [index, setIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fontes de sugestões
  const suggestions = useMemo(() => {
    if (!trigger) return [] as Array<{ label: string; sub?: string }>;
    const q = foldForSearch(trigger.query);
    if (trigger.mode === "wikilink") {
      const items = notes
        .filter((n) => !n.is_archived)
        .map((n) => ({ label: n.title, sub: undefined as string | undefined, score: foldForSearch(n.title).includes(q) ? foldForSearch(n.title).indexOf(q) : -1 }))
        .filter((x) => q.length === 0 || x.score >= 0)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8);
      return items;
    }
    const tagSet = new Set<string>();
    for (const n of notes) for (const t of n.tags ?? []) tagSet.add(t);
    return [...tagSet]
      .filter((t) => q.length === 0 || foldForSearch(t).includes(q))
      .sort()
      .slice(0, 8)
      .map((t) => ({ label: t, sub: "#tag" }));
  }, [trigger, notes]);

  // Atualiza trigger e posição do caret
  useEffect(() => {
    if (!textarea) {
      setTrigger(null);
      return;
    }
    const update = () => {
      const caret = textarea.selectionStart ?? 0;
      const t = detectTrigger(value, caret);
      setTrigger(t);
      setIndex(0);
      if (t) {
        // Posição aproximada: usa retângulo do textarea + offset baseado em linha
        const rect = textarea.getBoundingClientRect();
        const before = value.slice(0, caret);
        const linesBefore = before.split("\n");
        const currentLine = linesBefore.length - 1;
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 18;
        const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 12;
        const paddingLeft = parseFloat(getComputedStyle(textarea).paddingLeft) || 12;
        const colChars = linesBefore[linesBefore.length - 1].length;
        const charWidth = 7.2; // fonte mono aproximada
        setPos({
          top: rect.top + paddingTop + currentLine * lineHeight - textarea.scrollTop + lineHeight + 4,
          left: rect.left + paddingLeft + colChars * charWidth,
        });
      } else {
        setPos(null);
      }
    };
    update();
    textarea.addEventListener("keyup", update);
    textarea.addEventListener("click", update);
    textarea.addEventListener("scroll", update);
    return () => {
      textarea.removeEventListener("keyup", update);
      textarea.removeEventListener("click", update);
      textarea.removeEventListener("scroll", update);
    };
  }, [textarea, value]);

  // Navegação de teclado
  useEffect(() => {
    if (!textarea || !trigger) return;
    const onKey = (e: KeyboardEvent) => {
      if (!trigger) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setTrigger(null);
      } else if ((e.key === "Enter" || e.key === "Tab") && suggestions[index]) {
        e.preventDefault();
        accept(suggestions[index].label);
      }
    };
    textarea.addEventListener("keydown", onKey);
    return () => textarea.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textarea, trigger, suggestions, index]);

  const accept = (label: string) => {
    if (!trigger) return;
    const insertion = trigger.mode === "wikilink" ? `[[${label}]]` : `#${label}`;
    onInsert(insertion, trigger.start, trigger.end);
    setTrigger(null);
  };

  if (!trigger || !pos || suggestions.length === 0) return null;

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={trigger.mode === "wikilink" ? "Notas sugeridas" : "Tags sugeridas"}
      className="fixed z-50 w-64 max-h-60 overflow-auto rounded-md border border-border/60 bg-popover shadow-lg text-xs"
      style={{ top: pos.top, left: pos.left }}
    >
      {suggestions.map((s, i) => (
        <li
          key={`${s.label}-${i}`}
          role="option"
          aria-selected={i === index}
          onMouseDown={(e) => {
            e.preventDefault();
            accept(s.label);
          }}
          onMouseEnter={() => setIndex(i)}
          className={`px-2 py-1.5 cursor-pointer flex items-center justify-between gap-2 ${
            i === index ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60"
          }`}
        >
          <span className="truncate">
            {trigger.mode === "wikilink" ? "📄 " : "🏷️ "}
            {s.label}
          </span>
          {s.sub && <span className="text-[10px] opacity-60">{s.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
