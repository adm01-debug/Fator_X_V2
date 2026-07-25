/**
 * Bitrix24 Connect — Botão de OAuth para conectar com Bitrix24 CRM.
 * Chama bitrix24-oauth Edge Function via service layer.
 */
import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { invokeBitrix24OAuth, invokeBitrix24Api } from '@/services/llmGatewayService';
import { getAuthSession } from '@/services/securityService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Unlink, ExternalLink, RefreshCw, ShieldCheck, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export function Bitrix24Connect() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [domain, setDomain] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const session = await getAuthSession();
      if (!session) return;
      const data = await invokeBitrix24OAuth({ action: 'status' }) as Record<string, unknown>;
      setConnected(!!data.connected);
      setDomain(data.domain as string || null);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const data = await invokeBitrix24Api({ method: 'user.current', params: {} }) as { result?: { NAME?: string; LAST_NAME?: string } };
      if (data.result) {
        const result = data.result as { NAME?: string; LAST_NAME?: string };
        toast.success(`Conexão OK: ${result.NAME} ${result.LAST_NAME}`);
      } else {
        throw new Error('Resposta inválida da API');
      }
    } catch (err: unknown) {
      toast.error('Falha no teste: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    try {
      const data = await invokeBitrix24OAuth({ action: 'authorize' }) as Record<string, string>;
      if (data.auth_url) window.open(data.auth_url, '_blank', 'width=600,height=700');
    } catch (err) {
      logger.error('Bitrix24 connect failed:', err);
      toast.error('Erro ao iniciar autorização');
    }
  }

  if (loading) return <div className="animate-pulse bg-secondary/30 rounded-xl h-24" />;

  return (
    <div className="nexus-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-xl shadow-nexus-inner border border-primary/5">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-bold text-foreground">Bitrix24 CRM</span>
              <Badge variant={connected ? 'default' : 'outline'} className={`text-[9px] uppercase tracking-widest font-black ${connected ? 'bg-nexus-emerald/20 text-nexus-emerald border-nexus-emerald/30' : ''}`}>
                {connected ? '● Active' : 'Disconnected'}
              </Badge>
            </div>
            {domain && <span className="text-meta font-mono text-muted-foreground">{domain}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleTest} 
              disabled={testing}
              className="h-8 rounded-xl border-border/40 text-meta font-bold uppercase tracking-wider"
            >
              {testing ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3 h-3 mr-1.5 text-nexus-emerald" />}
              Testar API
            </Button>
          )}
          <Button 
            onClick={connected ? undefined : handleConnect} 
            variant={connected ? 'ghost' : 'default'} 
            size="sm"
            className={`h-8 rounded-xl text-meta font-bold uppercase tracking-wider ${connected ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/5' : 'nexus-gradient-bg text-primary-foreground'}`}
          >
            {connected ? <><Unlink className="w-3 h-3 mr-1.5" /> Disconnect</> : <><ExternalLink className="w-3 h-3 mr-1.5" /> Connect</>}
          </Button>
        </div>
      </div>
      
      {connected && (
        <div className="pt-3 border-t border-border/20 grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Protocol</span>
            <span className="text-meta font-bold text-foreground">OAuth 2.0 (REST)</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Scope</span>
            <span className="text-meta font-bold text-foreground">CRM, User, Entity</span>
          </div>
        </div>
      )}
    </div>
  );
}
