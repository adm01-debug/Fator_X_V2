import { useState } from 'react';
import { invokeBitrix24Api } from '@/services/llmGatewayService';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Play, Loader2, Database, Terminal, 
  Code2, History, Trash2, Copy, 
  ChevronRight, ArrowUpRight, ShieldCheck, 
  Info, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API_METHODS = [
  { value: 'crm.deal.list', label: 'Deal: Listar Negócios', cat: 'CRM' },
  { value: 'crm.deal.get', label: 'Deal: Obter Detalhes', cat: 'CRM' },
  { value: 'crm.contact.list', label: 'Contact: Listar Contatos', cat: 'CRM' },
  { value: 'crm.company.list', label: 'Company: Listar Empresas', cat: 'CRM' },
  { value: 'crm.lead.list', label: 'Lead: Listar Leads', cat: 'CRM' },
  { value: 'tasks.task.list', label: 'Tasks: Listar Tarefas', cat: 'Tarefas' },
  { value: 'user.current', label: 'User: Usuário Atual', cat: 'Sistema' },
  { value: 'entity.item.get', label: 'Entity: Obter Item', cat: 'Storage' },
];

export function Bitrix24ApiTester() {
  const [method, setMethod] = useState('crm.deal.list');
  const [params, setParams] = useState('{\n  "filter": { "STATUS_ID": "NEW" },\n  "select": ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID"]\n}');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [history, setHistory] = useState<Array<{method: string, ts: string, status: 'ok'|'err'}>>([]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const parsedParams = params.trim() ? JSON.parse(params) : {};
      const data = await invokeBitrix24Api({ method, params: parsedParams });
      setResult(data);
      setHistory(prev => [{ method, ts: new Date().toLocaleTimeString(), status: 'ok' as const }, ...prev].slice(0, 10));
      toast.success('Execução concluída com sucesso');
    } catch (e) {
      setHistory(prev => [{ method, ts: new Date().toLocaleTimeString(), status: 'err' as const }, ...prev].slice(0, 10));
      toast.error(e instanceof Error ? e.message : 'Erro na requisição');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para área de transferência');
  };

  return (
    <div className="flex flex-col h-[700px] border border-border/40 rounded-3xl overflow-hidden bg-card/30 backdrop-blur-sm">
      {/* Console Header */}
      <div className="p-6 border-b border-border/40 bg-secondary/20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Terminal className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-title-sm font-heading font-black text-foreground flex items-center gap-2">
              Bitrix24 SDK Console
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-black text-meta tracking-widest uppercase">
                Developer
              </Badge>
            </h3>
            <p className="text-meta text-muted-foreground font-medium">Playground industrial para chamadas REST autenticadas</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-nexus-emerald/10 border border-nexus-emerald/20">
            <ShieldCheck className="h-3.5 w-3.5 text-nexus-emerald" />
            <span className="text-meta font-bold text-nexus-emerald uppercase tracking-widest">Proxy Seguro Ativo</span>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[400px_1fr] divide-x border-border/40">
        {/* Editor Sidebar */}
        <div className="flex flex-col bg-background/20">
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <Label className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Endpoint (Method)</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-11 rounded-xl bg-secondary/40 border-border/30 font-mono text-meta">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/40">
                    {API_METHODS.map(m => (
                      <SelectItem key={m.value} value={m.value} className="font-mono text-meta">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <Label className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Parâmetros (JSON Body)</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-[9px] uppercase font-black px-2 gap-1" onClick={() => setParams('{}')}>
                    <Trash2 className="h-2.5 w-2.5" /> Limpar
                  </Button>
                </div>
                <textarea 
                  value={params} 
                  onChange={(e) => setParams(e.target.value)}
                  className="w-full h-64 p-4 rounded-2xl bg-secondary/40 border border-border/30 font-mono text-meta resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 leading-relaxed"
                  spellCheck={false}
                />
              </div>

              <Button 
                onClick={handleTest} 
                disabled={testing} 
                className="w-full h-12 rounded-2xl gap-2 nexus-gradient-bg text-primary-foreground font-black shadow-nexus-lg shadow-primary/20"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Disparar Requisição
              </Button>

              <div className="space-y-3 pt-4 border-t border-border/20">
                <h4 className="text-meta font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <History className="h-3 w-3" /> Histórico Recente
                </h4>
                <div className="space-y-1.5">
                  {history.length === 0 ? (
                    <p className="text-meta text-muted-foreground italic">Nenhuma chamada realizada</p>
                  ) : (
                    history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/20 border border-border/10 text-meta font-mono">
                        <span className="truncate flex-1">{h.method}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground opacity-60">{h.ts}</span>
                          <div className={cn("h-1.5 w-1.5 rounded-full", h.status === 'ok' ? "bg-nexus-emerald" : "bg-destructive")} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Results Viewer */}
        <div className="flex flex-col bg-background/40">
          <Tabs defaultValue="response" className="flex-1 flex flex-col">
            <div className="px-6 border-b border-border/40 bg-secondary/10 flex items-center justify-between shrink-0">
              <TabsList className="h-14 bg-transparent gap-6">
                <TabsTrigger value="response" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent bg-transparent gap-2 px-0 text-meta font-bold uppercase tracking-widest">
                  <Code2 className="h-3.5 w-3.5" /> Resposta
                </TabsTrigger>
                <TabsTrigger value="docs" className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent bg-transparent gap-2 px-0 text-meta font-bold uppercase tracking-widest">
                  <Info className="h-3.5 w-3.5" /> Documentação
                </TabsTrigger>
              </TabsList>
              
              {!!result && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 rounded-lg gap-2 text-meta font-bold uppercase tracking-wider"
                  onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                >
                  <Copy className="h-3 w-3" /> Copiar JSON
                </Button>
              )}
            </div>

            <TabsContent value="response" className="flex-1 p-0 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6">
                  {!result && !testing ? (
                    <div className="flex flex-col items-center justify-center py-32 text-center space-y-4">
                      <div className="h-20 w-20 rounded-[2.5rem] bg-secondary/30 flex items-center justify-center border border-border/40">
                        <Database className="h-10 w-10 text-muted-foreground/30" />
                      </div>
                      <div>
                        <p className="text-body-sm font-bold text-foreground">Aguardando execução</p>
                        <p className="text-meta text-muted-foreground mt-1">Configure os parâmetros e clique em Disparar</p>
                      </div>
                    </div>
                  ) : testing ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                      <div className="relative">
                        <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
                        <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-primary animate-pulse" />
                      </div>
                      <p className="text-meta text-muted-foreground font-mono uppercase tracking-widest animate-pulse">Consultando API Bitrix24...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nexus-emerald/10 border border-nexus-emerald/20 w-fit">
                        <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald" />
                        <span className="text-meta font-bold text-nexus-emerald uppercase tracking-widest">200 OK</span>
                      </div>
                      <div className="rounded-2xl border border-border/40 overflow-hidden bg-black/20 backdrop-blur-md">
                        <pre className="p-6 font-mono text-[12px] leading-relaxed text-nexus-cyan/90 overflow-x-auto">
                          {String(JSON.stringify(result, null, 2))}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="docs" className="flex-1 p-6 m-0">
               <div className="space-y-6">
                 <div className="nexus-card bg-primary/5 border-primary/20 p-5 space-y-3">
                   <h4 className="text-body-sm font-bold flex items-center gap-2">
                     <Info className="h-4 w-4 text-primary" /> Sobre {method}
                   </h4>
                   <p className="text-meta text-muted-foreground leading-relaxed">
                     Este endpoint permite a interação com a entidade {method.split('.')[1]} do Bitrix24. 
                     Certifique-se de que sua conexão possui os escopos necessários habilitados.
                   </p>
                   <Button variant="link" className="h-auto p-0 text-primary text-meta gap-1 font-bold">
                     Ver documentação oficial <ArrowUpRight className="h-3 w-3" />
                   </Button>
                 </div>
                 
                 <div className="space-y-4">
                   <h5 className="text-meta font-bold uppercase tracking-widest text-muted-foreground">Exemplos de Parâmetros</h5>
                   <div className="grid gap-3">
                     {[
                       { name: 'Filtro por Status', code: '{"filter": {"STATUS_ID": "NEW"}}' },
                       { name: 'Seleção de Campos', code: '{"select": ["ID", "TITLE", "DATE_CREATE"]}' },
                       { name: 'Paginação', code: '{"start": 50}' }
                     ].map((ex, i) => (
                       <div key={i} className="p-3 rounded-xl border border-border/30 bg-secondary/10 flex items-center justify-between group">
                         <div className="space-y-1">
                           <p className="text-meta font-bold">{ex.name}</p>
                           <code className="text-meta text-muted-foreground font-mono">{ex.code}</code>
                         </div>
                         <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setParams(ex.code)}>
                           <ChevronRight className="h-3.5 w-3.5" />
                         </Button>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Console Footer */}
      <div className="p-4 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            <span className="text-meta font-bold uppercase tracking-widest">bitrix24-api-proxy-v1.0</span>
          </div>
          <div className="h-3 w-px bg-border/40" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-meta font-medium">Auth: OAuth2 (Service Managed)</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">Nexus Framework v10.0</Badge>
        </div>
      </div>
    </div>
  );
}

