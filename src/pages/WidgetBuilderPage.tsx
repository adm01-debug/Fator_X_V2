import { useMemo, useState } from 'react';
import { Code2, Copy, Eye, MessageSquare, Palette, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { useAgents } from '@/hooks/use-data';
import { toast } from 'sonner';

const PRESETS = [
  { key: 'primary', label: 'Primário', from: '#4D96FF', to: '#6BCB77' },
  { key: 'sunset', label: 'Sunset', from: '#FF6B6B', to: '#FFD93D' },
  { key: 'purple', label: 'Purple', from: '#8B5CF6', to: '#EC4899' },
  { key: 'dark', label: 'Dark', from: '#0F172A', to: '#1E293B' },
];

const POSITIONS = [
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'top-left', label: 'Superior esquerdo' },
];

export default function WidgetBuilderPage() {
  const { data: agents = [], isLoading } = useAgents();
  const [agentId, setAgentId] = useState<string>('');
  const [title, setTitle] = useState('Assistente Nexus');
  const [subtitle, setSubtitle] = useState('Como posso te ajudar hoje?');
  const [greeting, setGreeting] = useState('Olá! 👋 Sou o assistente virtual. Pergunte-me qualquer coisa.');
  const [fromColor, setFromColor] = useState('#4D96FF');
  const [toColor, setToColor] = useState('#6BCB77');
  const [position, setPosition] = useState('bottom-right');
  const [buttonEmoji, setButtonEmoji] = useState('💬');

  const selectedAgent = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'fqdohnmgmtaycfwsioik';
  const widgetUrl = `https://${projectId}.supabase.co/functions/v1/widget-proxy/widget/${agentId || 'AGENT_ID'}.js`;

  const embedCode = useMemo(
    () => `<!-- Nexus Chat Widget -->
<script>
  window.NEXUS_WIDGET_CONFIG = {
    agent_id: "${agentId || 'AGENT_ID'}",
    title: "${title.replace(/"/g, '\\"')}",
    subtitle: "${subtitle.replace(/"/g, '\\"')}",
    greeting: "${greeting.replace(/"/g, '\\"')}",
    theme: { from: "${fromColor}", to: "${toColor}" },
    position: "${position}",
    emoji: "${buttonEmoji}"
  };
</script>
<script async src="${widgetUrl}"></script>`,
    [agentId, title, subtitle, greeting, fromColor, toColor, position, buttonEmoji, widgetUrl],
  );

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    toast.success('Código embed copiado para a área de transferência');
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setFromColor(p.from);
    setToColor(p.to);
    toast.success(`Tema "${p.label}" aplicado`);
  };

  const positionStyles: Record<string, string> = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Widget Builder"
        description="Construa um widget de chat embarcável para seu site com preview em tempo real"
      />


      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Config */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="nexus-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-title-sm">
                <Settings2 className="h-4 w-4 text-primary" /> Configuração
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={agentId} onValueChange={setAgentId} disabled={isLoading}>
                  <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.avatar_emoji ?? '🤖'} {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
              </div>

              <div className="space-y-2">
                <Label>Subtítulo</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} />
              </div>

              <div className="space-y-2">
                <Label>Mensagem de boas-vindas</Label>
                <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} maxLength={280} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Posição</Label>
                  <Select value={position} onValueChange={setPosition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Emoji do botão</Label>
                  <Input value={buttonEmoji} onChange={(e) => setButtonEmoji(e.target.value.slice(0, 2))} className="text-center text-xl" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="nexus-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-title-sm">
                <Palette className="h-4 w-4 text-primary" /> Tema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="rounded-xl h-14 border border-border hover:border-primary transition-all shadow-sm hover:shadow-md"
                    style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                    aria-label={`Aplicar tema ${p.label}`}
                    title={p.label}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cor inicial</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={fromColor} onChange={(e) => setFromColor(e.target.value)} className="w-14 h-10 p-1" />
                    <Input value={fromColor} onChange={(e) => setFromColor(e.target.value)} className="font-mono text-meta" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor final</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={toColor} onChange={(e) => setToColor(e.target.value)} className="w-14 h-10 p-1" />
                    <Input value={toColor} onChange={(e) => setToColor(e.target.value)} className="font-mono text-meta" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview + Embed */}
        <div className="xl:col-span-3 space-y-6">
          <Tabs defaultValue="preview">
            <TabsList className="bg-muted/50 p-1 rounded-xl h-11">
              <TabsTrigger value="preview" className="rounded-lg gap-2 font-bold data-[state=active]:bg-card">
                <Eye className="h-4 w-4" /> Preview
              </TabsTrigger>
              <TabsTrigger value="embed" className="rounded-lg gap-2 font-bold data-[state=active]:bg-card">
                <Code2 className="h-4 w-4" /> Código embed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="mt-4">
              <Card className="nexus-card overflow-hidden">
                <div className="relative bg-gradient-to-br from-muted/30 to-muted/60 h-[600px] rounded-lg border border-dashed border-border/60">
                  <div className="absolute inset-6 rounded-xl bg-background/40 backdrop-blur-sm p-6 flex items-center justify-center text-muted-foreground text-body-sm">
                    <div className="text-center space-y-2">
                      <MessageSquare className="h-10 w-10 mx-auto opacity-40" />
                      <p>Seu site aparecerá aqui — o widget flutua no canto configurado.</p>
                    </div>
                  </div>

                  {/* Widget preview */}
                  <div className={`absolute ${positionStyles[position]} flex flex-col items-end gap-3`}>
                    <div
                      className="w-[340px] rounded-2xl shadow-2xl overflow-hidden border border-border/60 bg-card animate-in fade-in slide-in-from-bottom-4"
                      style={{ display: agentId ? 'block' : 'none' }}
                    >
                      <div
                        className="p-4 text-white"
                        style={{ background: `linear-gradient(135deg, ${fromColor}, ${toColor})` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                            {selectedAgent?.avatar_emoji ?? '🤖'}
                          </div>
                          <div>
                            <p className="font-bold text-body-sm">{title}</p>
                            <p className="text-meta opacity-90">{subtitle}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-background max-h-64 overflow-y-auto space-y-2">
                        <div className="flex gap-2">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-body-sm shrink-0">
                            {selectedAgent?.avatar_emoji ?? '🤖'}
                          </div>
                          <div className="bg-muted rounded-2xl rounded-tl-sm p-3 text-body-sm max-w-[80%]">
                            {greeting}
                          </div>
                        </div>
                      </div>
                      <div className="p-3 border-t border-border/50 bg-background flex gap-2">
                        <Input placeholder="Digite sua mensagem..." className="h-9" disabled />
                        <Button size="sm" style={{ background: `linear-gradient(135deg, ${fromColor}, ${toColor})` }} className="text-white h-9">
                          Enviar
                        </Button>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="h-14 w-14 rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-transform"
                      style={{ background: `linear-gradient(135deg, ${fromColor}, ${toColor})` }}
                      aria-label="Abrir chat"
                    >
                      {buttonEmoji}
                    </button>
                  </div>
                </div>
              </Card>
              {!agentId && (
                <p className="text-center text-meta text-muted-foreground mt-3">
                  Selecione um agente para visualizar a janela de chat.
                </p>
              )}
            </TabsContent>

            <TabsContent value="embed" className="mt-4 space-y-4">
              <Card className="nexus-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-title-sm">Cole no &lt;body&gt; do seu site</CardTitle>
                  <Button size="sm" onClick={copyEmbed} disabled={!agentId} className="gap-2">
                    <Copy className="h-4 w-4" /> Copiar
                  </Button>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted/60 rounded-xl p-4 text-meta font-mono overflow-x-auto whitespace-pre-wrap break-all border border-border/60">
{embedCode}
                  </pre>
                  {!agentId && (
                    <p className="text-meta text-nexus-amber mt-3">
                      ⚠ Selecione um agente antes de copiar — o código atual contém apenas o placeholder <code>AGENT_ID</code>.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="nexus-card">
                <CardHeader>
                  <CardTitle className="text-title-sm">URL do widget</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="text-meta font-mono text-muted-foreground break-all">{widgetUrl}</code>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
