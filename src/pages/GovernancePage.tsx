import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceId } from '@/hooks/use-data';
import {
  listIpWhitelist,
  listAllowedCountries,
  addAllowedCountry,
  deleteAllowedCountry,
  listAccessBlockedLog,
} from '@/services/accessControlService';
import {
  listFreezeWindows,
  createFreezeWindow,
  deleteFreezeWindow,
} from '@/services/freezeWindowService';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  geocodeAddress,
  reverseGeocode,
  parseCoordinates,
  isGeoCodeAvailable,
  type GeoLookupResult,
} from '@/services/geoCodeService';
import {
  Snowflake,
  Globe2,
  Plus,
  Trash2,
  ShieldAlert,
  Info,
  Network,
  ShieldCheck,
  ShieldOff,
  ArrowUpRight,
  Ban,
  MapPin,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import type { DbRow } from '@/types/dbRow';

type FreezeWindow = {
  id: string;
  workspace_id: string;
  name: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  allow_emergency: boolean;
  created_at: string;
};

export type GeoCountry = {
  id: string;
  workspace_id: string;
  country_code: string;
  country_name: string | null;
  created_at: string;
};

export type IPEntry = {
  id: string;
  ip_address: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
};

export type BlockedEntry = {
  id: string;
  ip_address: string | null;
  country_code: string | null;
  reason: string;
  created_at: string;
};

const COMMON_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: 'BR', name: 'Brasil' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'DE', name: 'Alemanha' },
  { code: 'FR', name: 'França' },
  { code: 'ES', name: 'Espanha' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CA', name: 'Canadá' },
  { code: 'JP', name: 'Japão' },
  { code: 'AU', name: 'Austrália' },
];

const isActive = (w: FreezeWindow) => {
  const now = Date.now();
  return new Date(w.starts_at).getTime() <= now && new Date(w.ends_at).getTime() >= now;
};

export default function GovernancePage() {
  const { data: workspaceId } = useWorkspaceId();
  const qc = useQueryClient();

  const freezeQuery = useQuery({
    queryKey: ['governance', 'freeze', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => listFreezeWindows(workspaceId!),
  });

  const geoQuery = useQuery({
    queryKey: ['governance', 'geo', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => listAllowedCountries(workspaceId!),
  });

  const ipQuery = useQuery({
    queryKey: ['governance', 'ip_whitelist', workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => listIpWhitelist(workspaceId!),
  });

  const blockedQuery = useQuery({
    queryKey: ['governance', 'access_blocked', workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async () => listAccessBlockedLog(workspaceId!),
  });

  const [freezeOpen, setFreezeOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fReason, setFReason] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fEmergency, setFEmergency] = useState(true);

  const createFreeze = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error('Workspace ausente');
      if (!fName.trim() || !fStart || !fEnd) {
        throw new Error('Nome, início e fim são obrigatórios');
      }
      await createFreezeWindow(workspaceId, {
        name: fName.trim(),
        reason: fReason.trim() || null,
        starts_at: new Date(fStart).toISOString(),
        ends_at: new Date(fEnd).toISOString(),
        allow_emergency: fEmergency,
      });
    },
    onSuccess: () => {
      toast.success('Janela de congelamento criada');
      setFreezeOpen(false);
      setFName('');
      setFReason('');
      setFStart('');
      setFEnd('');
      setFEmergency(true);
      qc.invalidateQueries({ queryKey: ['governance', 'freeze'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteFreeze = useMutation({
    mutationFn: async (id: string) => deleteFreezeWindow(id),
    onSuccess: () => {
      toast.success('Janela removida');
      qc.invalidateQueries({ queryKey: ['governance', 'freeze'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleCountry = useMutation({
    mutationFn: async (opts: DbRow) => {
      if (!workspaceId) throw new Error('Workspace ausente');
      if (opts.enabled) {
        await addAllowedCountry(workspaceId, opts.code as string, opts.name as string | undefined);
      } else {
        const { data: existing } = await supabase
          .from('geo_allowed_countries')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('country_code', opts.code as string)
          .maybeSingle();
        if (existing) await deleteAllowedCountry(existing.id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['governance', 'geo'] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [geoLookupInput, setGeoLookupInput] = useState('');
  const [geoLookup, setGeoLookup] = useState<GeoLookupResult | null>(null);
  const [geoResolving, setGeoResolving] = useState(false);

  // `geo-code` só era alcançável por API key: a tela exigia o ISO-2 digitado de memória,
  // e um código errado faz a regra de geo-restrição nunca bloquear ninguém.
  const resolveGeoLookup = async () => {
    const raw = geoLookupInput.trim();
    if (raw.length < 3) {
      toast.error('Informe um endereço, cidade ou "latitude, longitude"');
      return;
    }
    setGeoResolving(true);
    try {
      const coords = parseCoordinates(raw);
      const result = coords
        ? await reverseGeocode(coords.latitude, coords.longitude)
        : await geocodeAddress(raw);
      setGeoLookup(result);
      if (result.data.country_code) {
        setCustomCode(result.data.country_code);
        setCustomName(result.data.country ?? '');
        toast.success(
          `País identificado: ${result.data.country ?? result.data.country_code} (${result.data.country_code}) via ${result.provider}`,
        );
      } else {
        toast.warning(
          `Localizado "${result.data.formatted_address}", mas o provedor não retornou o país.`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao consultar o provedor de mapas');
    } finally {
      setGeoResolving(false);
    }
  };

  const geoHealthQuery = useQuery({
    queryKey: ['governance', 'geo-health'],
    queryFn: isGeoCodeAvailable,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const addCustomCountry = useMutation({
    mutationFn: async () => {
      const code = customCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) {
        throw new Error('Código ISO 3166-1 alpha-2 (2 letras)');
      }
      if (!workspaceId) throw new Error('Workspace ausente');
      await addAllowedCountry(workspaceId, code, customName.trim() || undefined);
    },
    onSuccess: () => {
      toast.success('País adicionado');
      setCustomCode('');
      setCustomName('');
      qc.invalidateQueries({ queryKey: ['governance', 'geo'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const freezes = freezeQuery.data ?? [];
  const countries = geoQuery.data ?? [];
  const ipEntries = ipQuery.data ?? [];
  const blocked = blockedQuery.data ?? [];
  const activeFreeze = freezes.find(isActive);
  const enabledCodes = new Set(countries.map((c) => c.country_code));
  const activeIps = ipEntries.filter((i) => i.is_active);
  const cidrCount = ipEntries.filter((i) => i.ip_address.includes('/')).length;
  const ipProtectionOn = activeIps.length > 0;
  const geoProtectionOn = countries.length > 0;
  const last24hBlocks = blocked.filter(
    (b) => Date.now() - new Date(b.created_at).getTime() < 24 * 60 * 60 * 1000,
  ).length;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Governança e Compliance"
        description="Congelamento de mudanças, restrições geográficas e políticas operacionais do workspace."
      />

      {activeFreeze && (
        <Alert className="border-nexus-amber/40 bg-nexus-amber/5">
          <ShieldAlert className="h-4 w-4 text-nexus-amber" />
          <AlertTitle>Janela de congelamento ativa</AlertTitle>
          <AlertDescription>
            <b>{activeFreeze.name}</b> — encerra em{' '}
            {format(new Date(activeFreeze.ends_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}.{' '}
            {activeFreeze.allow_emergency
              ? 'Deploys emergenciais permitidos com aprovação.'
              : 'Deploys totalmente bloqueados.'}
          </AlertDescription>
        </Alert>
      )}

      {last24hBlocks > 0 && (
        <Alert className="border-destructive/40 bg-destructive/5">
          <Ban className="h-4 w-4 text-destructive" />
          <AlertTitle>
            {last24hBlocks} tentativa(s) de acesso bloqueada(s) nas últimas 24h
          </AlertTitle>
          <AlertDescription>
            Consulte a aba <b>IP Whitelist</b> para detalhes e ajuste de políticas.
          </AlertDescription>
        </Alert>
      )}

      {/* Status geral de proteção */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={ipProtectionOn ? 'border-nexus-emerald/40' : 'border-muted'}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-body-sm text-muted-foreground flex items-center gap-2">
              <Network className="h-4 w-4" /> Proteção por IP
            </CardTitle>
            {ipProtectionOn ? (
              <Badge className="bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30">
                <ShieldCheck className="h-3 w-3 mr-1" /> Ativa
              </Badge>
            ) : (
              <Badge variant="secondary">
                <ShieldOff className="h-3 w-3 mr-1" /> Aberta
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeIps.length}
              <span className="text-body-sm font-normal text-muted-foreground">
                {' '}
                / {ipEntries.length} regras
              </span>
            </div>
            <p className="text-meta text-muted-foreground mt-1">
              {cidrCount} bloco(s) CIDR configurado(s)
            </p>
          </CardContent>
        </Card>

        <Card className={geoProtectionOn ? 'border-nexus-emerald/40' : 'border-muted'}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-body-sm text-muted-foreground flex items-center gap-2">
              <Globe2 className="h-4 w-4" /> Restrição geográfica
            </CardTitle>
            {geoProtectionOn ? (
              <Badge className="bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30">
                <ShieldCheck className="h-3 w-3 mr-1" /> Ativa
              </Badge>
            ) : (
              <Badge variant="secondary">
                <ShieldOff className="h-3 w-3 mr-1" /> Aberta
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countries.length}</div>
            <p className="text-meta text-muted-foreground mt-1">países permitidos</p>
          </CardContent>
        </Card>

        <Card className={last24hBlocks > 0 ? 'border-destructive/40' : 'border-muted'}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-body-sm text-muted-foreground flex items-center gap-2">
              <Ban className="h-4 w-4" /> Bloqueios (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${last24hBlocks > 0 ? 'text-destructive' : ''}`}>
              {last24hBlocks}
            </div>
            <p className="text-meta text-muted-foreground mt-1">
              {blocked.length} evento(s) recentes
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="freeze" className="w-full">
        <TabsList>
          <TabsTrigger value="freeze">
            <Snowflake className="h-4 w-4 mr-2" />
            Janelas de Congelamento
          </TabsTrigger>
          <TabsTrigger value="geo">
            <Globe2 className="h-4 w-4 mr-2" />
            Restrições Geográficas
          </TabsTrigger>
          <TabsTrigger value="ip">
            <Network className="h-4 w-4 mr-2" />
            IP Whitelist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="freeze" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova janela
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova janela de congelamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fname">Nome</Label>
                    <Input
                      id="fname"
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      placeholder="Black Friday freeze"
                    />
                  </div>
                  <div>
                    <Label htmlFor="freason">Motivo</Label>
                    <Textarea
                      id="freason"
                      value={fReason}
                      onChange={(e) => setFReason(e.target.value)}
                      placeholder="Alta demanda comercial; bloquear alterações não-críticas."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="fstart">Início</Label>
                      <Input
                        id="fstart"
                        type="datetime-local"
                        value={fStart}
                        onChange={(e) => setFStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fend">Fim</Label>
                      <Input
                        id="fend"
                        type="datetime-local"
                        value={fEnd}
                        onChange={(e) => setFEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="font-medium text-body-sm">Permitir emergências</div>
                      <div className="text-meta text-muted-foreground">
                        Deploys críticos podem passar com aprovação dupla.
                      </div>
                    </div>
                    <Switch checked={fEmergency} onCheckedChange={setFEmergency} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFreezeOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createFreeze.mutate()} disabled={createFreeze.isPending}>
                    Criar janela
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {freezeQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : freezes.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Nenhuma janela configurada</AlertTitle>
              <AlertDescription>
                Crie janelas para bloquear deploys durante períodos críticos (releases, feriados,
                campanhas).
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {freezes.map((w) => (
                <Card key={w.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-body">{w.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {isActive(w) && (
                          <Badge className="bg-nexus-amber/20 text-nexus-amber border-nexus-amber/40">
                            Ativa
                          </Badge>
                        )}
                        {w.allow_emergency && <Badge variant="outline">Emergência OK</Badge>}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteFreeze.mutate(w.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="text-body-sm space-y-1">
                    {w.reason && <p className="text-muted-foreground">{w.reason}</p>}
                    <div className="text-meta text-muted-foreground">
                      {format(new Date(w.starts_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })} →{' '}
                      {format(new Date(w.ends_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="geo" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Whitelist geográfica</AlertTitle>
            <AlertDescription>
              Se nenhum país estiver selecionado, todas as origens são permitidas. Ao adicionar
              países, apenas requisições vindas deles serão aceitas.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-body">Países comuns</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {COMMON_COUNTRIES.map((c) => {
                const enabled = enabledCodes.has(c.code);
                return (
                  <button
                    key={c.code}
                    onClick={() =>
                      toggleCountry.mutate({ code: c.code, name: c.name, enabled: !enabled })
                    }
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      enabled ? 'bg-primary/10 border-primary/40' : 'bg-card hover:bg-accent/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-meta">{c.code}</span>
                      {enabled && <Badge variant="secondary">Ativo</Badge>}
                    </div>
                    <div className="text-body-sm mt-1">{c.name}</div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-body flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Adicionar país personalizado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/40 p-3 space-y-2 bg-secondary/20">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="geolookup" className="text-meta">
                    Descobrir o país por endereço ou coordenadas
                  </Label>
                  {geoHealthQuery.data === false && (
                    <Badge variant="secondary" className="text-meta">
                      provedor de mapas indisponível
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    id="geolookup"
                    value={geoLookupInput}
                    onChange={(e) => setGeoLookupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void resolveGeoLookup();
                    }}
                    placeholder="Av. Paulista 1000, São Paulo — ou -23.5614, -46.6559"
                    className="flex-1 min-w-[240px]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void resolveGeoLookup()}
                    disabled={geoResolving}
                  >
                    {geoResolving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-2" />
                    )}
                    Descobrir país
                  </Button>
                </div>
                {geoLookup && (
                  <div className="text-meta text-muted-foreground space-y-0.5">
                    <div>{geoLookup.data.formatted_address}</div>
                    <div>
                      {geoLookup.data.country_code ?? 'sem ISO'}{' '}
                      {geoLookup.data.country ? `· ${geoLookup.data.country}` : ''}
                      {geoLookup.data.city ? ` · ${geoLookup.data.city}` : ''}
                      {geoLookup.data.state ? ` · ${geoLookup.data.state}` : ''}
                      {` · via ${geoLookup.provider}`}
                    </div>
                  </div>
                )}
                <p className="text-meta text-muted-foreground">
                  O código ISO preenchido abaixo é o que a regra de geo-restrição compara no
                  bloqueio de acesso.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label htmlFor="ccode">Código (ISO)</Label>
                  <Input
                    id="ccode"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    maxLength={2}
                    className="w-24 font-mono uppercase"
                    placeholder="BR"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="cname">Nome</Label>
                  <Input
                    id="cname"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Brasil"
                  />
                </div>
                <Button
                  onClick={() => addCustomCountry.mutate()}
                  disabled={addCustomCountry.isPending}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>

          {countries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-body">Países permitidos ({countries.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {countries.map((c) => (
                  <Badge
                    key={c.id}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() =>
                      toggleCountry.mutate({
                        code: c.country_code,
                        name: c.country_name ?? c.country_code,
                        enabled: false,
                      })
                    }
                  >
                    {c.country_code} — {c.country_name ?? '—'}
                    <Trash2 className="h-3 w-3 ml-2" />
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ip" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Alert className="flex-1 min-w-[280px]">
              <Info className="h-4 w-4" />
              <AlertTitle>Whitelist de IP</AlertTitle>
              <AlertDescription>
                {ipProtectionOn
                  ? `${activeIps.length} regra(s) ativas restringem o acesso administrativo. Requisições fora dos IPs/CIDRs cadastrados são bloqueadas e registradas abaixo.`
                  : 'Nenhuma regra ativa — o acesso administrativo está aberto a qualquer origem. Configure IPs confiáveis para elevar a postura de segurança.'}
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline">
              <Link to="/security/ip-whitelist">
                Gerenciar IPs
                <ArrowUpRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-body flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-nexus-emerald" />
                  Regras ativas ({activeIps.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[320px] overflow-y-auto">
                {ipQuery.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : ipEntries.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground py-4 text-center">
                    Nenhum IP cadastrado.
                  </p>
                ) : (
                  ipEntries.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border bg-card/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-meta font-mono font-semibold">
                            {entry.ip_address}
                          </code>
                          {entry.ip_address.includes('/') && (
                            <Badge variant="outline" className="text-meta px-1">
                              CIDR
                            </Badge>
                          )}
                          {!entry.is_active && (
                            <Badge variant="secondary" className="text-meta">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        {entry.label && (
                          <p className="text-meta text-muted-foreground truncate">{entry.label}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {ipEntries.length > 8 && (
                  <p className="text-meta text-muted-foreground text-center pt-2">
                    +{ipEntries.length - 8} outras regras
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-body flex items-center gap-2">
                  <Ban className="h-4 w-4 text-destructive" />
                  Tentativas bloqueadas (10 recentes)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[320px] overflow-y-auto">
                {blockedQuery.isLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : blocked.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground py-4 text-center">
                    Nenhum bloqueio registrado. ✅
                  </p>
                ) : (
                  blocked.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md border border-destructive/20 bg-destructive/5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-meta font-mono">{b.ip_address ?? '—'}</code>
                          {b.country_code && (
                            <Badge variant="outline" className="text-meta px-1">
                              {b.country_code}
                            </Badge>
                          )}
                          <Badge variant="destructive" className="text-meta">
                            {b.reason}
                          </Badge>
                        </div>
                        <p className="text-meta text-muted-foreground">
                          {formatDistanceToNow(new Date(b.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
