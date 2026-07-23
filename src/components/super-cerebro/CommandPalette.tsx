/**
 * CommandPalette — paleta global ⌘P / Ctrl+P (estilo Obsidian).
 * Complementa o ⌘K (que abre só o Quick Switcher de notas).
 */
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem as CmdItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { CommandItem } from "@/lib/commands";
import { foldForSearch } from "@/lib/normalize";

interface Props {
  commands: CommandItem[];
}

export function CommandPalette({ commands }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isP = e.key.toLowerCase() === "p";
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && isP) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && isP) {
        // ⌘P puro também abre — atalho principal do Obsidian
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = commands.reduce<Record<string, CommandItem[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Digite um comando ou busque…" />
      <CommandList>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
        {Object.entries(groups).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((c) => {
              const Icon = c.icon;
              return (
                <CmdItem
                  key={c.id}
                  value={`${c.label} ${foldForSearch(c.label)} ${c.keywords ?? ""}`}
                  onSelect={async () => {
                    setOpen(false);
                    await c.run();
                  }}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />}
                  <span>{c.label}</span>
                  {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                </CmdItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
