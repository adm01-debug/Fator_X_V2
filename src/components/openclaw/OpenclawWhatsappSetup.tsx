/**
 * OpenclawWhatsappSetup — pareamento de instância WhatsApp via QR Code.
 * Polling adaptativo com cleanup rígido (evita leak após unmount).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Bot, Save } from 'lucide-react';
import { toast } from 'sonner';
import { pairWhatsapp, getWhatsappStatus, type WhatsappPairResult } from '@/services/openclawDeployService';
import { listAgentSummaries, type AgentSummary } from '@/services/agentsService';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';

type UiStatus = 'idle' | 'pending' | 'connected' | 'expired' | 'error';

const PENDING_INTERVAL_MS = 2000;
const CONNECTED_INTERVAL_MS = 30_000;
const PAIRING_TIMEOUT_MS = 90_000;

export function OpenclawWhatsappSetup() {
  const [instanceName, setInstanceName] = useState('promo-brindes');
  const [uiStatus, setUiStatus] = useState<UiStatus>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const applyResult = useCallback((res: WhatsappPairResult | undefined) => {
    if (!mountedRef.current || !res) return;
    if (res.qr_code !== undefined) setQrCode(res.qr_code ?? null);
    if (res.phone_number) setPhone(res.phone_number);
    const s = res.status ?? 'pending';
    if (s === 'connected') setUiStatus('connected');
    else if (s === 'expired' || s === 'error') setUiStatus(s);
    else setUiStatus('pending');
  }, []);

  const scheduleNext = useCallback(
    (name: string) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const interval = uiStatus === 'connected' ? CONNECTED_INTERVAL_MS : PENDING_INTERVAL_MS;
      timerRef.current = window.setTimeout(async () => {
        if (!mountedRef.current) return;
        // Timeout de pareamento
        if (
          uiStatus === 'pending' &&
          startedAtRef.current !== null &&
          Date.now() - startedAtRef.current > PAIRING_TIMEOUT_MS
        ) {
          setUiStatus('expired');
          return;
        }
        try {
          const r = await getWhatsappStatus(name);
          applyResult(r.data);
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : 'Falha ao consultar status');
          setUiStatus('error');
          return;
        }
        if (mountedRef.current && (uiStatus === 'pending' || uiStatus === 'connected')) {
          scheduleNext(name);
        }
      }, interval);
    },
    [applyResult, uiStatus],
  );

  const handlePair = useCallback(async () => {
    if (!instanceName.trim()) {
      toast.error('Informe um nome de instância.');
      return;
    }
    setStarting(true);
    setError(null);
    setQrCode(null);
    setPhone(null);
    startedAtRef.current = Date.now();
    try {
      const r = await pairWhatsapp(instanceName.trim());
      applyResult(r.data);
      setUiStatus((prev) => (prev === 'connected' || prev === 'error' ? prev : 'pending'));
      scheduleNext(instanceName.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar pareamento';
      setError(msg);
      setUiStatus('error');
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  }, [applyResult, instanceName, scheduleNext]);

  const badge = (() => {
    switch (uiStatus) {
      case 'connected':
        return <Badge className="bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30 gap-1"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>;
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Aguardando QR</Badge>;
      case 'expired':
        return <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500"><AlertTriangle className="h-3 w-3" />QR expirado</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Erro</Badge>;
      default:
        return <Badge variant="outline">Sem instância</Badge>;
    }
  })();

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title-sm">
          <QrCode className="h-4 w-4 text-nexus-emerald" /> WhatsApp — Pareamento
          <span className="ml-auto">{badge}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="wa-instance">Nome da instância</Label>
            <Input
              id="wa-instance"
              aria-label="Nome da instância WhatsApp"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="promo-brindes"
              className="bg-background border-border"
              disabled={starting || uiStatus === 'pending'}
            />
          </div>
          <Button
            onClick={handlePair}
            disabled={starting || uiStatus === 'pending'}
            className="gap-2"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {uiStatus === 'expired' ? 'Gerar novo QR' : 'Conectar WhatsApp'}
          </Button>
        </div>

        {phone && (
          <p className="text-body-sm text-muted-foreground">
            Número conectado: <span className="font-mono">{phone}</span>
          </p>
        )}

        {qrCode && uiStatus !== 'connected' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <img
              src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
              alt="QR Code WhatsApp"
              className="h-64 w-64 rounded-lg border border-border bg-background p-2"
            />
            <p className="text-meta text-muted-foreground text-center max-w-sm">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho, e escaneie este QR.
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-body-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
