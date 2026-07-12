import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, Send, Loader2, Plus, X, Eye } from 'lucide-react';
import {
  sendNotificationViaEF,
  NOTIFICATION_PRESETS,
  type NotificationChannel,
} from '@/services/notificationEngineService';
import { useToast } from '@/hooks/use-toast';

const CHANNELS: NotificationChannel[] = ['email', 'whatsapp', 'slack', 'push', 'sms', 'in_app', 'webhook'];

interface Props {
  onSent?: () => void;
}

function extractVars(text: string): string[] {
  const matches = text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
  return Array.from(new Set(Array.from(matches, (m) => m[1])));
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

export function MultiChannelComposer({ onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<NotificationChannel[]>(['email']);
  const [recipients, setRecipients] = useState<Record<string, string>>({ email: '' });
  const [subject, setSubject] = useState('Nexus — Comunicado');
  const [message, setMessage] = useState('Olá {{nome}}, esta é uma comunicação enviada em {{data}}.');
  const [vars, setVars] = useState<Record<string, string>>({ nome: '', data: new Date().toLocaleDateString('pt-BR') });
  const { toast } = useToast();

  const detectedVars = useMemo(() => extractVars(`${subject} ${message}`), [subject, message]);
  const previewSubject = useMemo(() => interpolate(subject, vars), [subject, vars]);
  const previewMessage = useMemo(() => interpolate(message, vars), [message, vars]);

  const toggleChannel = (c: NotificationChannel) => {
    setSelectedChannels((prev) => {
      const has = prev.includes(c);
      const next = has ? prev.filter((x) => x !== c) : [...prev, c];
      if (!has && !(c in recipients)) setRecipients((r) => ({ ...r, [c]: '' }));
      return next;
    });
  };

  const loadPreset = (key: string) => {
    const preset = NOTIFICATION_PRESETS[key as keyof typeof NOTIFICATION_PRESETS];
    if (!preset) return;
    setSubject(preset.subject);
    setMessage(preset.body);
    if (!selectedChannels.includes(preset.channel)) toggleChannel(preset.channel);
    const newVars: Record<string, string> = { ...vars };
    for (const v of extractVars(`${preset.subject} ${preset.body}`)) {
      if (!(v in newVars)) newVars[v] = '';
    }
    setVars(newVars);
  };

  const handleSend = async () => {
    if (selectedChannels.length === 0) {
      toast({ title: 'Selecione ao menos um canal', variant: 'destructive' });
      return;
    }
    const missing = selectedChannels.filter((c) => !recipients[c]?.trim());
    if (missing.length) {
      toast({ title: 'Destinatários obrigatórios', description: `Preencha: ${missing.join(', ')}`, variant: 'destructive' });
      return;
    }

    setSending(true);
    const results: Array<{ channel: NotificationChannel; ok: boolean; err?: string }> = [];
    for (const channel of selectedChannels) {
      const list = recipients[channel].split(',').map((r) => r.trim()).filter(Boolean);
      for (const recipient of list) {
        try {
          await sendNotificationViaEF({
            channel,
            recipient,
            subject: previewSubject,
            message: previewMessage,
            priority: 'normal',
            metadata: { source: 'multi-channel-composer', vars },
          });
          results.push({ channel, ok: true });
        } catch (e) {
          results.push({ channel, ok: false, err: e instanceof Error ? e.message : 'erro' });
        }
      }
    }
    setSending(false);
    const okCount = results.filter((r) => r.ok).length;
    const errCount = results.length - okCount;
    toast({
      title: errCount === 0 ? 'Envio multi-canal concluído' : 'Envio parcial',
      description: `${okCount} sucesso(s), ${errCount} falha(s)`,
      variant: errCount === 0 ? 'default' : 'destructive',
    });
    if (okCount > 0) {
      setOpen(false);
      onSent?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-meta border-border hover:bg-accent hover:border-primary"
        >
          <Layers className="h-3.5 w-3.5" />
          Composer Multi-Canal
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Composer Multi-Canal
          </DialogTitle>
          <DialogDescription>
            Envie a mesma mensagem para vários canais com variáveis interpoladas via <code className="text-primary">{'{{variavel}}'}</code>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Carregar preset</Label>
              <Select onValueChange={loadPreset}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Selecione um preset ou escreva do zero" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Object.keys(NOTIFICATION_PRESETS).map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Canais</Label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const active = selectedChannels.includes(c);
                  return (
                    <Badge
                      key={c}
                      variant={active ? 'default' : 'outline'}
                      onClick={() => toggleChannel(c)}
                      className={`cursor-pointer capitalize ${active ? 'bg-primary text-primary-foreground' : 'border-border'}`}
                    >
                      {active ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                      {c}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {selectedChannels.length > 0 && (
              <div className="space-y-2">
                <Label>Destinatários por canal</Label>
                <div className="space-y-2">
                  {selectedChannels.map((c) => (
                    <div key={c} className="grid grid-cols-[80px_1fr] items-center gap-2">
                      <span className="text-meta text-muted-foreground capitalize">{c}</span>
                      <Input
                        value={recipients[c] ?? ''}
                        onChange={(e) => setRecipients((r) => ({ ...r, [c]: e.target.value }))}
                        placeholder={
                          c === 'email' ? 'usuario@empresa.com, outro@empresa.com'
                          : c === 'whatsapp' || c === 'sms' ? '+5511999999999, +5511888888888'
                          : c === 'slack' ? '#canal ou @user'
                          : c === 'webhook' ? 'https://exemplo.com/hook'
                          : 'identificador(es), separados por vírgula'
                        }
                        className="bg-background border-border font-mono text-meta"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="mc-subject">Assunto</Label>
              <Input
                id="mc-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-message">Mensagem</Label>
              <Textarea
                id="mc-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="bg-background border-border resize-none font-mono text-body-sm"
              />
            </div>

            {detectedVars.length > 0 && (
              <div className="space-y-2">
                <Label>Variáveis detectadas</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {detectedVars.map((v) => (
                    <div key={v} className="grid grid-cols-[100px_1fr] items-center gap-2">
                      <code className="text-meta text-primary">{`{{${v}}}`}</code>
                      <Input
                        value={vars[v] ?? ''}
                        onChange={(e) => setVars((prev) => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`valor para ${v}`}
                        className="bg-background border-border text-meta"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center gap-2 text-meta text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </div>
              <p className="text-body-sm font-semibold text-foreground">{previewSubject}</p>
              <p className="text-body-sm whitespace-pre-wrap text-muted-foreground">{previewMessage}</p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending} className="border-border">
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || selectedChannels.length === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar para {selectedChannels.length} canal(is)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
