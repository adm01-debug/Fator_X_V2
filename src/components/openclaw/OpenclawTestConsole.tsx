import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { chatWithOpenclawAgent, type OpenclawAgent } from "@/services/openclawDeployService";

interface Turn {
  role: "user" | "assistant";
  text: string;
  ts: string;
}

interface OpenclawTestConsoleProps {
  agents: OpenclawAgent[];
  disabled?: boolean;
}

/** Chat rápido para validar um agente do runtime OpenClaw. */
export function OpenclawTestConsole({ agents, disabled }: OpenclawTestConsoleProps) {
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Turn[]>([]);

  const handleSend = async () => {
    if (!agentId) {
      toast.error("Selecione um agent para testar");
      return;
    }
    if (!message.trim()) return;
    const userTurn: Turn = { role: "user", text: message.trim(), ts: new Date().toISOString() };
    setHistory((h) => [...h, userTurn]);
    setMessage("");
    setBusy(true);
    try {
      const res = await chatWithOpenclawAgent(agentId, userTurn.text);
      const reply = res.data?.reply ?? "(sem resposta)";
      setHistory((h) => [...h, { role: "assistant", text: reply, ts: new Date().toISOString() }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na chamada");
      setHistory((h) => [
        ...h,
        {
          role: "assistant",
          text: `⚠ Erro: ${e instanceof Error ? e.message : "desconhecido"}`,
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-sm">
          <MessageSquare className="h-4 w-4 text-nexus-cyan" /> Console de Teste
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-3">
          <div className="space-y-2">
            <Label htmlFor="oc-agent">Agent</Label>
            <Select value={agentId} onValueChange={setAgentId} disabled={disabled || agents.length === 0}>
              <SelectTrigger id="oc-agent" className="bg-background border-border">
                <SelectValue placeholder={agents.length ? "Selecionar" : "Sem agents"} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name || a.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div
          role="log"
          aria-label="Histórico da conversa de teste"
          className="min-h-[220px] max-h-[380px] overflow-y-auto space-y-2 p-3 rounded-lg bg-background border border-border"
        >
          {history.length === 0 ? (
            <p className="text-meta text-muted-foreground text-center py-8">
              Envie uma mensagem para testar o agente selecionado.
            </p>
          ) : (
            history.map((t, i) => (
              <div
                key={i}
                className={`text-body-sm p-2 rounded ${
                  t.role === "user"
                    ? "bg-primary/10 border border-primary/20 ml-8"
                    : "bg-secondary/50 border border-border/50 mr-8"
                }`}
              >
                <p className="text-meta text-muted-foreground uppercase tracking-wider mb-1">
                  {t.role === "user" ? "Você" : "Agent"}
                </p>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="oc-msg">Mensagem</Label>
          <div className="flex gap-2">
            <Textarea
              id="oc-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Digite e pressione Ctrl/Cmd+Enter para enviar"
              rows={3}
              disabled={disabled || busy}
              className="bg-background border-border resize-none"
            />
            <Button
              onClick={handleSend}
              disabled={disabled || busy || !message.trim() || !agentId}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
