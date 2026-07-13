import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Webhook, Loader2, Send, Clipboard, PlayCircle, History, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import {
  listWebhooks,
  triggerWebhookViaEF,
  getWebhookEvents,
  WEBHOOK_TEMPLATES,
  type WebhookEndpoint,
  type WebhookEvent,
} from '@/services/webhookTriggerService';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const AUTH_LABELS: Record<string, string> = {
  none: 'Sem Auth', header: 'Header', hmac_sha256: 'HMAC SHA-256',
  basic: 'Basic', bearer: 'Bearer', api_key: 'API Key',
};

export function WebhookManagerPanel() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookEndpoint | null>(null);
  const [testPayload, setTestPayload] = useState('{\n  "test": true,\n  "source": "nexus-studio",\n  "event": "manual_trigger"\n}');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyWebhook, setHistoryWebhook] = useState<WebhookEndpoint | null>(null);
  const [historyEvents, setHistoryEvents] = useState<WebhookEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    listWebhooks()
      .then(setWebhooks)
      .catch(() => toast({ title: 'Erro ao carregar webhooks', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [toast]);

  const openHistory = async (w: WebhookEndpoint) => {
    setHistoryWebhook(w);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const events = await getWebhookEvents(w.id, 50);
      setHistoryEvents(events);
    } catch {
      toast({ title: 'Erro ao carregar histórico', variant: 'destructive' });
      setHistoryEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReplay = async (event: WebhookEvent) => {
    if (!historyWebhook) return;
    setReplayingId(event.id);
    try {
      const result = await triggerWebhookViaEF({
        path: historyWebhook.path,
        payload: (event.body ?? {}) as Record<string, unknown>,
      });
      toast({
        title: 'Replay disparado',
        description: `${historyWebhook.name} — status ${result.status}`,
      });
      // Recarrega histórico após replay
      const events = await getWebhookEvents(historyWebhook.id, 50);
      setHistoryEvents(events);
    } catch (e) {
      toast({
        title: 'Falha no replay',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setReplayingId(null);
    }
  };

  const handleTest = async () => {
    if (!selectedWebhook) return;
    setTestingId(selectedWebhook.id);
    try {
      let payloadObj = { test: true };
      try {
        payloadObj = JSON.parse(testPayload);
      } catch (_e) {
        toast({ title: 'JSON inválido', variant: 'destructive' });
        setTestingId(null);
        return;
      }

      const result = await triggerWebhookViaEF({
        path: selectedWebhook.path,
        payload: payloadObj,
      });

      toast({
        title: 'Webhook disparado',
        description: `${selectedWebhook.name} — status ${result.status}`,
      });
      setTestDialogOpen(false);
    } catch (e) {
      toast({
        title: 'Falha no teste',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setTestingId(null);
    }
  };

  const openTestDialog = (w: WebhookEndpoint) => {
    setSelectedWebhook(w);
    setTestDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Webhooks', value: webhooks.length, color: 'hsl(var(--nexus-purple))' },
          { label: 'Ativos', value: webhooks.filter(w => w.status === 'active').length, color: 'hsl(var(--nexus-emerald))' },
          { label: 'Requests Total', value: webhooks.reduce((s, w) => s + w.request_count, 0), color: 'hsl(var(--nexus-blue))' },
        ].map((s, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-meta text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="text-body-sm text-muted-foreground">Templates Prontos</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(WEBHOOK_TEMPLATES).map(([key, tpl]) => (
              <div key={key} className="p-3 rounded-lg bg-background border border-border hover:border-nexus-purple/50 cursor-pointer">
                <p className="font-medium text-body-sm">{tpl.name}</p>
                <p className="text-meta text-muted-foreground mt-1">{tpl.description}</p>
                <Badge variant="outline" className="mt-2 text-meta border-border">{tpl.auth_type ? AUTH_LABELS[tpl.auth_type] ?? tpl.auth_type : 'N/A'}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando webhooks...</div>
      ) : webhooks.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Webhook size={48} className="mx-auto mb-4 opacity-30" />
            <p>Nenhum webhook configurado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <Card key={w.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{w.name}</p>
                    <code className="text-meta text-muted-foreground font-mono">{w.path}</code>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {w.methods.map(m => <Badge key={m} variant="outline" className="text-meta border-border">{m}</Badge>)}
                      <Badge variant="outline" className="text-meta border-border">{AUTH_LABELS[w.auth_type] ?? w.auth_type}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge className={w.status === 'active' ? 'bg-nexus-emerald/20 text-nexus-emerald' : 'bg-destructive/20 text-destructive'}>{w.status}</Badge>
                    <p className="text-meta text-muted-foreground">{w.request_count} requests</p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-meta gap-1.5 border-border hover:bg-accent hover:border-primary"
                        onClick={() => openHistory(w)}
                      >
                        <History className="h-3 w-3" />
                        Histórico
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-meta gap-1.5 border-border hover:bg-accent hover:border-primary"
                        disabled={w.status !== 'active'}
                        onClick={() => openTestDialog(w)}
                      >
                        <Send className="h-3 w-3" />
                        Testar
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Test Webhook Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-border/40 p-8 shadow-nexus-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading font-black flex items-center gap-2">
              <PlayCircle className="h-6 w-6 text-primary" />
              Testar Webhook
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="space-y-2">
              <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">Webhook Alvo</Label>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/20">
                <p className="text-body-sm font-bold text-foreground">{selectedWebhook?.name}</p>
                <code className="text-meta text-muted-foreground">{selectedWebhook?.path}</code>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">JSON Payload</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-meta gap-1"
                  onClick={() => navigator.clipboard.writeText(testPayload)}
                >
                  <Clipboard className="h-3 w-3" /> Copiar
                </Button>
              </div>
              <Textarea 
                value={testPayload} 
                onChange={(e) => setTestPayload(e.target.value)} 
                className="font-mono text-meta min-h-[160px] rounded-xl bg-secondary/20"
              />
            </div>

            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={() => setTestDialogOpen(false)} className="h-12 rounded-xl px-6">Cancelar</Button>
              <Button onClick={handleTest} disabled={!!testingId} className="h-12 px-8 rounded-xl nexus-gradient-bg text-primary-foreground font-bold shadow-nexus-lg shadow-primary/20">
                {testingId ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                <span className="ml-2">Disparar Agora</span>
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* History + Replay Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[720px] rounded-[2rem] border-border/40 p-8 shadow-nexus-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading font-black flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              Histórico & Replay
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/20">
              <p className="text-body-sm font-bold text-foreground">{historyWebhook?.name}</p>
              <code className="text-meta text-muted-foreground">{historyWebhook?.path}</code>
            </div>
            {historyLoading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando eventos...
              </div>
            ) : historyEvents.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Nenhum evento registrado ainda.</p>
              </div>
            ) : (
              <ScrollArea className="h-[420px] pr-4">
                <div className="space-y-2">
                  {historyEvents.map((ev) => {
                    const ok = ev.status === 'processed' || ev.status === 'received';
                    return (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-background border border-border/40 hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-meta border-border">
                                {ev.method}
                              </Badge>
                              <Badge
                                className={
                                  ok
                                    ? 'bg-nexus-emerald/20 text-nexus-emerald text-meta gap-1'
                                    : 'bg-destructive/20 text-destructive text-meta gap-1'
                                }
                              >
                                {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {ev.status}
                              </Badge>
                              <span className="text-meta text-muted-foreground">HTTP {ev.response_code}</span>
                              {ev.processing_time_ms != null && (
                                <span className="text-meta text-muted-foreground">
                                  {ev.processing_time_ms}ms
                                </span>
                              )}
                            </div>
                            <p className="text-meta text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(ev.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                              {ev.source_ip ? ` · ${ev.source_ip}` : ''}
                            </p>
                            {ev.error && (
                              <p className="text-meta text-destructive mt-1 truncate">{ev.error}</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-meta gap-1.5 border-border hover:border-primary shrink-0"
                            disabled={replayingId === ev.id || historyWebhook?.status !== 'active'}
                            onClick={() => handleReplay(ev)}
                          >
                            {replayingId === ev.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Replay
                          </Button>
                        </div>
                        {ev.body && Object.keys(ev.body).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-meta text-muted-foreground cursor-pointer hover:text-foreground">
                              Ver payload
                            </summary>
                            <pre className="mt-2 p-2 rounded-lg bg-secondary/30 border border-border/20 text-meta font-mono overflow-x-auto max-h-40">
                              {JSON.stringify(ev.body, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setHistoryOpen(false)}
              className="h-12 rounded-xl px-6"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
