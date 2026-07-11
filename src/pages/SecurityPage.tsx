import { useState, useEffect } from 'react';
import { SecurityPosture } from "@/components/security/SecurityPosture";
import { SecurityMonitoringPanel } from "@/components/security/SecurityMonitoringPanel";
import { ComplianceFrameworks } from "@/components/security/ComplianceFrameworks";
import { GuardrailPolicies } from "@/components/security/GuardrailPolicies";
import { SessionManagement } from "@/components/security/SessionManagement";
import { RateLimitingPanel } from "@/components/security/RateLimitingPanel";
import { AuditLogSection } from "@/components/security/AuditLogSection";
import { GuardrailsConfig } from "@/components/agent-builder/GuardrailsConfig";
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/securityService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Key, Plus, Trash2, Loader2, Copy, Shield, ShieldCheck, Lock, Fingerprint, Activity, Terminal } from 'lucide-react';
import { AccessControl, DangerousActionDialog } from '@/components/rbac';
import { toast } from 'sonner';
import { RedTeamingPanel } from '@/components/security/RedTeamingPanel';
import { PIIScannerPanel } from '@/components/security/PIIScannerPanel';
import { TwoFactorSetup } from '@/components/security/TwoFactorSetup';
import { AccessControlPanel } from '@/components/security/AccessControlPanel';
import { GuardrailsLibrary } from '@/components/security/GuardrailsLibrary';
import { GuardrailsSimulator } from '@/components/security/GuardrailsSimulator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
}

function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);

  useEffect(() => { loadKeys(); }, []);

  async function loadKeys() {
    try { setKeys(await listApiKeys() as ApiKey[]); } catch { /* table might not exist */ }
    setLoading(false);
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await createApiKey(newKeyName.trim());
      setNewRawKey(result.raw_key);
      setNewKeyName('');
      await loadKeys();
      toast.success('API Key criada');
    } catch {
      toast.error('Falha ao criar API Key');
    }
    setCreating(false);
  }

  async function handleRevoke(id: string) {
    try {
      await revokeApiKey(id);
      await loadKeys();
      toast.success('API Key revogada');
    } catch { toast.error('Falha ao revogar'); }
  }

  return (
    <div className="bg-card border border-border/40 p-8 rounded-[2rem] space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-title-sm font-bold text-foreground">API Keys</h3>
            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">Integrações Seguras</p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none px-3 font-bold">{keys.length} Ativas</Badge>
      </div>

      {newRawKey && (
        <div className="bg-nexus-emerald/10 border border-nexus-emerald/30 rounded-2xl p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-nexus-emerald" />
            <p className="text-nexus-emerald font-black text-meta uppercase tracking-widest">Nova Chave Mestra</p>
          </div>
          <p className="text-meta text-nexus-emerald/80 font-medium mb-3 italic">Copie agora — esta chave não será exibida novamente por motivos de segurança.</p>
          <div className="flex items-center gap-2 bg-background/50 p-2 rounded-xl border border-nexus-emerald/20">
            <code className="px-2 py-1 font-mono text-nexus-emerald flex-1 truncate text-meta">{newRawKey}</code>
            <Button size="sm" variant="ghost" className="hover:bg-nexus-emerald/20 h-8 w-8 p-0" onClick={() => { navigator.clipboard.writeText(newRawKey); toast.success('Copiada!'); }}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Input 
          value={newKeyName} 
          onChange={(e) => setNewKeyName(e.target.value)} 
          placeholder="Nome do identificador (ex: Produção Externo)" 
          className="h-12 rounded-xl bg-secondary/30 border-border/30 focus:ring-primary/20 text-body-sm font-medium" 
        />
        <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()} className="h-12 px-6 rounded-xl nexus-gradient-bg text-primary-foreground font-bold">
          {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
          Gerar Chave
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-primary/20" /></div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 bg-secondary/10 border border-dashed border-border/40 rounded-2xl text-center">
          <Terminal className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-body-sm text-muted-foreground font-medium">Nenhuma chave de integração ativa no momento.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {keys.map((k) => (
            <div key={k.id} className="bg-secondary/20 border border-border/20 rounded-2xl p-4 flex items-center justify-between group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-background flex items-center justify-center shadow-sm">
                  <Fingerprint className="w-5 h-5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <span className="text-body-sm font-bold text-foreground">{k.name}</span>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="text-meta text-muted-foreground font-mono bg-background/50 px-1.5 py-0.5 rounded uppercase tracking-wider">{k.key_prefix}...****</code>
                    <div className={cn(
                      "h-1.5 w-1.5 rounded-full animate-pulse",
                      k.is_active ? "bg-nexus-emerald" : "bg-destructive"
                    )} />
                  </div>
                </div>
              </div>
              {k.is_active && (
                <AccessControl permission="settings.api_keys">
                  <DangerousActionDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-10 w-10 p-0 rounded-xl">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    }
                    title="Anular Acesso da Chave"
                    description="Esta ação é imediata e irreversível. Todas as conexões utilizando esta chave serão cortadas instantaneamente."
                    action="revoke"
                    resourceType="api_key"
                    resourceId={k.id}
                    resourceName={k.name ?? k.key_prefix}
                    minReasonLength={10}
                    requirePassword={true}
                    confirmLabel="Anular Acesso"
                    metadata={{ key_prefix: k.key_prefix }}
                    onConfirm={async () => {
                      await handleRevoke(k.id);
                    }}
                  />
                </AccessControl>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-8 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-xl shadow-primary/5 mb-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Shield className="h-11 w-11 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">Fortaleza de Segurança</h1>
                <Badge className="bg-nexus-cyan/10 text-nexus-cyan border-none font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase">Grade Industrial</Badge>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Governança neural avançada. Controle guardrails, compliance, auditoria e resiliência em um ecossistema blindado.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-nexus-emerald font-black text-body-sm uppercase tracking-tighter">
                <ShieldCheck className="h-4 w-4" /> Postura Segura
              </div>
              <p className="text-meta text-muted-foreground font-bold tracking-widest uppercase">Monitoramento 24/7 Ativo</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-8">
        <TabsList className="bg-muted/50 p-1.5 rounded-2xl border border-border/40 h-auto flex-wrap gap-1">
          <TabsTrigger value="overview" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">Visão Geral</TabsTrigger>
          <TabsTrigger value="guardrails" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold"><Lock className="h-4 w-4" /> Guardrails</TabsTrigger>
          <TabsTrigger value="access" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold"><Fingerprint className="h-4 w-4" /> Acesso & Chaves</TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">Compliance & Auditoria</TabsTrigger>
          <TabsTrigger value="threats" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold"><Activity className="h-4 w-4" /> Red Teaming</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm gap-2 font-bold">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <SecurityPosture />
              <div className="grid md:grid-cols-2 gap-8">
                <TwoFactorSetup />
                <RateLimitingPanel />
              </div>
            </div>
            <div className="lg:col-span-1">
              <SecurityMonitoringPanel />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="guardrails" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid lg:grid-cols-2 gap-8">
            <GuardrailsLibrary />
            <GuardrailsSimulator />
          </div>
          <GuardrailsConfig />
          <GuardrailPolicies />
        </TabsContent>

        <TabsContent value="access" className="space-y-8 animate-in fade-in duration-500">
          <AccessControlPanel />
          <ApiKeysPanel />
          <SessionManagement />
        </TabsContent>

        <TabsContent value="compliance" className="space-y-8 animate-in fade-in duration-500">
          <ComplianceFrameworks />
          <AuditLogSection />
          <PIIScannerPanel />
        </TabsContent>

        <TabsContent value="threats" className="animate-in fade-in duration-500">
          <RedTeamingPanel />
        </TabsContent>

        <TabsContent value="audit" className="animate-in fade-in duration-500">
          <AuditLogSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
