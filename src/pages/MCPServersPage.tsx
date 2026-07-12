/**
 * MCP Servers Registry — UI para gerenciar servidores Model Context Protocol
 * conectados ao workspace. Descobre tools automaticamente ao registrar.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, Plus, RefreshCw, Trash2, Loader2, Wrench, CheckCircle2, XCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { listMCPServers, registerMCPServer, removeMCPServer, type MCPServer, type MCPTool } from "@/lib/mcp";
import { PageHeader } from "@/components/shared/PageHeader";

type Transport = "streamable-http" | "sse";

function StatusPill({ status }: { status: MCPServer["status"] }) {
  const map = {
    connected: { icon: CheckCircle2, label: "Conectado", cls: "bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20" },
    disconnected: { icon: WifiOff, label: "Desconectado", cls: "bg-muted text-muted-foreground border-border" },
    error: { icon: XCircle, label: "Erro", cls: "bg-destructive/10 text-destructive border-destructive/20" },
  } as const;
  const it = map[status] ?? map.disconnected;
  const Icon = it.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 font-bold text-meta ${it.cls}`}>
      <Icon className="h-3 w-3" /> {it.label}
    </Badge>
  );
}

export default function MCPServersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<Transport>("streamable-http");

  const { data: servers = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["mcp_servers"],
    queryFn: listMCPServers,
  });

  const addMut = useMutation({
    mutationFn: () => registerMCPServer({ name: name.trim(), url: url.trim(), transport }),
    onSuccess: (srv) => {
      toast.success(
        srv.status === "connected"
          ? `Conectado: ${srv.tools?.length ?? 0} tools descobertas`
          : `Registrado, mas conexão falhou: ${srv.error ?? "verifique a URL"}`,
      );
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
      setOpen(false);
      setName(""); setUrl(""); setTransport("streamable-http");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao registrar"),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeMCPServer(id),
    onSuccess: () => {
      toast.success("Servidor removido");
      qc.invalidateQueries({ queryKey: ["mcp_servers"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao remover"),
  });

  const canSubmit = name.trim().length > 1 && /^https?:\/\/.+/i.test(url.trim());
  const totalTools = servers.reduce((s, sv) => s + (Array.isArray(sv.tools) ? sv.tools.length : 0), 0);
  const connectedCount = servers.filter((s) => s.status === "connected").length;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="MCP Servers"
        description="Gerencie servidores Model Context Protocol conectados ao workspace. Descubra e invoque tools remotas de forma padronizada."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2 nexus-gradient-bg font-bold"><Plus className="h-4 w-4" /> Novo Servidor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar servidor MCP</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="mcp-name">Nome</Label>
                    <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: GitHub Copilot MCP" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mcp-url">URL</Label>
                    <Input id="mcp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com/mcp" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Transporte</Label>
                    <Select value={transport} onValueChange={(v) => setTransport(v as Transport)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                        <SelectItem value="sse">SSE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={() => addMut.mutate()} disabled={!canSubmit || addMut.isPending}>
                    {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Registrar e Conectar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Servidores", value: servers.length, cls: "text-primary" },
          { label: "Conectados", value: connectedCount, cls: "text-nexus-emerald" },
          { label: "Tools", value: totalTools, cls: "text-nexus-cyan" },
          { label: "Falhas", value: servers.filter((s) => s.status === "error").length, cls: "text-destructive" },
        ].map((m) => (
          <Card key={m.label} className="p-4 text-center">
            <div className={`text-2xl font-heading font-black ${m.cls}`}>{m.value}</div>
            <div className="text-meta font-bold uppercase tracking-widest text-muted-foreground mt-1">{m.label}</div>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : servers.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Boxes className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-title-sm font-semibold text-foreground mb-1">Nenhum servidor MCP registrado</h2>
          <p className="text-body-sm text-muted-foreground">Registre um servidor para descobrir e invocar tools remotas.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {servers.map((srv) => {
            const tools = (Array.isArray(srv.tools) ? srv.tools : []) as MCPTool[];
            return (
              <Card key={srv.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-body font-bold text-foreground">{srv.name}</h3>
                      <StatusPill status={srv.status} />
                      <Badge variant="outline" className="text-meta font-mono">{srv.transport}</Badge>
                    </div>
                    <p className="text-meta text-muted-foreground font-mono truncate">{srv.url}</p>
                    {srv.error && (
                      <p className="text-meta text-destructive mt-2">⚠️ {srv.error}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMut.mutate(srv.id)}
                    disabled={removeMut.isPending}
                    className="text-destructive hover:text-destructive gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Remover
                  </Button>
                </div>

                {tools.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <p className="text-meta font-bold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Wrench className="h-3 w-3" /> Tools descobertas ({tools.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {tools.map((t) => (
                        <Badge key={t.name} variant="secondary" className="font-mono text-meta" title={t.description}>
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
