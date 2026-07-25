/**
 * Forensic Snapshots — trilha imutável de decisões de agentes com chain-hash
 * para auditoria forense (compliance SOC2/ISO27001).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Fingerprint, ShieldCheck, ShieldAlert, Search, Link2, Eye } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Snapshot = {
  id: string;
  execution_id: string;
  agent_id: string;
  step_index: number;
  decision_type: string;
  state_before: unknown;
  state_after: unknown;
  decision_rationale: string;
  input_hash: string;
  output_hash: string;
  chain_hash: string;
  previous_hash: string;
  metadata: unknown;
  created_at: string;
};

function truncateHash(hash: string, chars = 8) {
  if (!hash) return "—";
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

export default function ForensicSnapshotsPage() {
  const [executionFilter, setExecutionFilter] = useState("");
  const [detail, setDetail] = useState<Snapshot | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["forensic_snapshots", executionFilter],
    queryFn: async () => {
      let query = supabase
        .from("forensic_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (executionFilter.trim()) {
        query = query.ilike("execution_id", `%${executionFilter.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Snapshot[];
    },
  });

  const chainStats = useMemo(() => {
    if (!data || data.length === 0) return { total: 0, valid: 0, broken: 0 };
    // Agrupa por execution_id e valida se cada snapshot referencia previous_hash correto.
    const byExec = new Map<string, Snapshot[]>();
    for (const snap of data) {
      const list = byExec.get(snap.execution_id) ?? [];
      list.push(snap);
      byExec.set(snap.execution_id, list);
    }
    let valid = 0;
    let broken = 0;
    for (const list of byExec.values()) {
      const sorted = [...list].sort((a, b) => a.step_index - b.step_index);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].previous_hash === sorted[i - 1].chain_hash) valid++;
        else broken++;
      }
    }
    return { total: data.length, valid, broken };
  }, [data]);

  return (
    <main className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Snapshots Forenses"
        description="Trilha imutável de decisões dos agentes com chain-hash criptográfico para auditoria forense e compliance."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Total registrado</CardTitle>
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{chainStats.total}</p>
            <p className="text-meta text-muted-foreground">nas últimas 200 decisões</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Elos válidos</CardTitle>
            <ShieldCheck className="h-4 w-4 text-nexus-green" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-nexus-green">{chainStats.valid}</p>
            <p className="text-meta text-muted-foreground">hash anterior confere</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-body-sm font-medium text-muted-foreground">Elos quebrados</CardTitle>
            <ShieldAlert className="h-4 w-4 text-nexus-red" />
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${chainStats.broken > 0 ? "text-nexus-red" : "text-muted-foreground"}`}>
              {chainStats.broken}
            </p>
            <p className="text-meta text-muted-foreground">possível adulteração</p>
          </CardContent>
        </Card>
      </div>

      {chainStats.broken > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Integridade da cadeia comprometida</AlertTitle>
          <AlertDescription>
            {chainStats.broken} elo(s) não confere(m) com o hash anterior. Isso pode indicar
            adulteração da trilha ou snapshots fora de ordem. Investigue imediatamente.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Cadeia de decisões
          </CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Filtrar por execution_id…"
              value={executionFilter}
              onChange={(e) => setExecutionFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Fingerprint className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-body-sm text-muted-foreground">
                Nenhum snapshot forense registrado ainda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Execução</TableHead>
                    <TableHead>Passo</TableHead>
                    <TableHead>Decisão</TableHead>
                    <TableHead>Chain hash</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((snap) => (
                    <TableRow key={snap.id}>
                      <TableCell className="text-meta text-muted-foreground whitespace-nowrap">
                        {format(new Date(snap.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-mono text-meta">{truncateHash(snap.execution_id, 6)}</TableCell>
                      <TableCell><Badge variant="outline">#{snap.step_index}</Badge></TableCell>
                      <TableCell>
                        <Badge variant="secondary">{snap.decision_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-meta">{truncateHash(snap.chain_hash)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setDetail(snap)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do snapshot forense</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-body-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-meta text-muted-foreground">Execução</p>
                  <p className="font-mono text-meta break-all">{detail.execution_id}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Agente</p>
                  <p className="font-mono text-meta break-all">{detail.agent_id}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Passo</p>
                  <p>#{detail.step_index}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Tipo de decisão</p>
                  <p>{detail.decision_type}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Input hash</p>
                  <p className="font-mono text-meta break-all">{detail.input_hash}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Output hash</p>
                  <p className="font-mono text-meta break-all">{detail.output_hash}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Chain hash</p>
                  <p className="font-mono text-meta break-all">{detail.chain_hash}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground">Previous hash</p>
                  <p className="font-mono text-meta break-all">{detail.previous_hash || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-meta text-muted-foreground mb-1">Racional</p>
                <p className="rounded-md border bg-muted/40 p-3 text-body-sm">{detail.decision_rationale}</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-meta text-muted-foreground mb-1">Estado antes</p>
                  <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-meta">
                    {JSON.stringify(detail.state_before, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground mb-1">Estado depois</p>
                  <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-meta">
                    {JSON.stringify(detail.state_after, null, 2)}
                  </pre>
                </div>
              </div>

              {detail.metadata !== null && detail.metadata !== undefined && (
                <div>
                  <p className="text-meta text-muted-foreground mb-1">Metadata</p>
                  <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-meta">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
