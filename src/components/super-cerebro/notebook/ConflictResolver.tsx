/**
 * ConflictResolver — UI dedicada para resolver conflitos de sync E2EE nota-a-nota.
 * Cada card mostra diff linha-a-linha (LCS), timestamps e três opções de merge:
 *  - Manter local (default)
 *  - Usar recebida (sobrescreve local)
 *  - Mesclar (concatena com separador para revisão manual)
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowRight, GitMerge, HardDrive, DownloadCloud } from "lucide-react";
import { computeLineDiff, diffStats } from "@/lib/lineDiff";
import type { Conflict, BundlePayload } from "@/services/e2eeService";

export type Resolution = "local" | "incoming" | "merge";

export interface ResolvedConflict {
  id: string;
  resolution: Resolution;
  /** Corpo final quando `resolution === "merge"`. */
  mergedBody?: string;
}

interface LocalNoteRef {
  id: string;
  title: string;
  body_md: string;
  updated_at: string;
}

interface Props {
  conflicts: Conflict[];
  localNotes: LocalNoteRef[];
  incoming: BundlePayload;
  onChange: (resolutions: Map<string, ResolvedConflict>) => void;
}

export function ConflictResolver({ conflicts, localNotes, incoming, onChange }: Props) {
  const localMap = useMemo(() => new Map(localNotes.map((n) => [n.id, n])), [localNotes]);
  const incomingMap = useMemo(() => new Map(incoming.notes.map((n) => [n.id, n])), [incoming.notes]);

  const [resolutions, setResolutions] = useState<Map<string, ResolvedConflict>>(() => {
    const m = new Map<string, ResolvedConflict>();
    for (const c of conflicts) m.set(c.id, { id: c.id, resolution: "local" });
    return m;
  });

  const setOne = (id: string, resolution: Resolution) => {
    const loc = localMap.get(id);
    const inc = incomingMap.get(id);
    const mergedBody =
      resolution === "merge" && loc && inc
        ? mergeBodies(loc.body_md, inc.body_md)
        : undefined;
    const next = new Map(resolutions);
    next.set(id, { id, resolution, mergedBody });
    setResolutions(next);
    onChange(next);
  };

  const applyAll = (resolution: Resolution) => {
    const next = new Map<string, ResolvedConflict>();
    for (const c of conflicts) {
      const loc = localMap.get(c.id);
      const inc = incomingMap.get(c.id);
      next.set(c.id, {
        id: c.id,
        resolution,
        mergedBody: resolution === "merge" && loc && inc ? mergeBodies(loc.body_md, inc.body_md) : undefined,
      });
    }
    setResolutions(next);
    onChange(next);
  };

  if (conflicts.length === 0) return null;

  const summary = countResolutions(resolutions);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1"><HardDrive className="h-3 w-3" /> Manter: {summary.local}</Badge>
          <Badge variant="default" className="gap-1"><DownloadCloud className="h-3 w-3" /> Sobrescrever: {summary.incoming}</Badge>
          <Badge variant="secondary" className="gap-1"><GitMerge className="h-3 w-3" /> Mesclar: {summary.merge}</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => applyAll("local")}>Todas: manter</Button>
          <Button size="sm" variant="ghost" onClick={() => applyAll("incoming")}>Todas: sobrescrever</Button>
          <Button size="sm" variant="ghost" onClick={() => applyAll("merge")}>Todas: mesclar</Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[520px] overflow-auto pr-1">
        {conflicts.map((c) => {
          const loc = localMap.get(c.id);
          const inc = incomingMap.get(c.id);
          const currentRes = resolutions.get(c.id)?.resolution ?? "local";
          return (
            <Card key={c.id} className="border-nexus-amber/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 min-w-0">
                  <span className="truncate">{c.title_local}</span>
                  {c.title_incoming !== c.title_local && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate text-muted-foreground italic">{c.title_incoming}</span>
                    </>
                  )}
                </CardTitle>
                <div className="text-[11px] text-muted-foreground">
                  local: {formatTs(c.updated_local)} · recebida: {formatTs(c.updated_incoming)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Tabs defaultValue="diff">
                  <TabsList className="h-8">
                    <TabsTrigger value="diff" className="text-xs h-6">Diff</TabsTrigger>
                    <TabsTrigger value="side" className="text-xs h-6">Lado a lado</TabsTrigger>
                    {currentRes === "merge" && loc && inc && (
                      <TabsTrigger value="preview" className="text-xs h-6">Prévia do merge</TabsTrigger>
                    )}
                  </TabsList>
                  <TabsContent value="diff" className="mt-2">
                    <DiffView a={loc?.body_md ?? ""} b={inc?.body_md ?? ""} />
                  </TabsContent>
                  <TabsContent value="side" className="mt-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <BodyBlock label="Local" body={loc?.body_md ?? ""} />
                      <BodyBlock label="Recebida" body={inc?.body_md ?? ""} tone="incoming" />
                    </div>
                  </TabsContent>
                  {currentRes === "merge" && loc && inc && (
                    <TabsContent value="preview" className="mt-2">
                      <BodyBlock label="Resultado do merge" body={mergeBodies(loc.body_md, inc.body_md)} tone="merge" />
                    </TabsContent>
                  )}
                </Tabs>

                <RadioGroup
                  value={currentRes}
                  onValueChange={(v) => setOne(c.id, v as Resolution)}
                  className="grid grid-cols-3 gap-2"
                >
                  <ResOption id={`res-${c.id}-local`} value="local" icon={<HardDrive className="h-3.5 w-3.5" />} label="Manter local" />
                  <ResOption id={`res-${c.id}-inc`} value="incoming" icon={<DownloadCloud className="h-3.5 w-3.5" />} label="Usar recebida" />
                  <ResOption id={`res-${c.id}-merge`} value="merge" icon={<GitMerge className="h-3.5 w-3.5" />} label="Mesclar" />
                </RadioGroup>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ResOption({ id, value, icon, label }: { id: string; value: Resolution; icon: React.ReactNode; label: string }) {
  return (
    <Label
      htmlFor={id}
      className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-xs cursor-pointer hover:bg-secondary/40 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
    >
      <RadioGroupItem id={id} value={value} />
      {icon}
      <span>{label}</span>
    </Label>
  );
}

function DiffView({ a, b }: { a: string; b: string }) {
  const diff = useMemo(() => computeLineDiff(a.split("\n"), b.split("\n")), [a, b]);
  const stats = diffStats(diff);
  return (
    <div className="rounded border border-border/50 bg-background/60">
      <div className="flex items-center gap-3 border-b border-border/50 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="text-emerald-500">+{stats.added}</span>
        <span className="text-rose-500">−{stats.removed}</span>
        <span>={stats.same}</span>
      </div>
      <pre className="max-h-56 overflow-auto p-2 text-[11px] leading-relaxed font-mono">
        {diff.map((line, i) => {
          const bg =
            line.kind === "added" ? "bg-emerald-500/10 text-emerald-200"
            : line.kind === "removed" ? "bg-rose-500/10 text-rose-200"
            : "text-muted-foreground";
          const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " ";
          return (
            <div key={i} className={`px-1 ${bg}`}>
              <span className="inline-block w-4 select-none opacity-60">{marker}</span>
              {line.text || "\u00A0"}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function BodyBlock({ label, body, tone }: { label: string; body: string; tone?: "incoming" | "merge" }) {
  const border =
    tone === "incoming" ? "border-primary/40"
    : tone === "merge" ? "border-nexus-amber/40"
    : "border-border/50";
  return (
    <div className={`rounded border ${border} bg-background/60`}>
      <div className="border-b border-border/50 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre className="max-h-56 overflow-auto p-2 text-[11px] font-mono whitespace-pre-wrap">{body || "(vazio)"}</pre>
    </div>
  );
}

function mergeBodies(local: string, incoming: string): string {
  if (local.trim() === incoming.trim()) return local;
  return [
    local.trimEnd(),
    "",
    "<!-- ⚠️ Conflito de sync — versão recebida abaixo -->",
    "",
    incoming.trimStart(),
  ].join("\n");
}

function countResolutions(m: Map<string, ResolvedConflict>) {
  let local = 0, incoming = 0, merge = 0;
  for (const r of m.values()) {
    if (r.resolution === "local") local++;
    else if (r.resolution === "incoming") incoming++;
    else merge++;
  }
  return { local, incoming, merge };
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : ts;
}
