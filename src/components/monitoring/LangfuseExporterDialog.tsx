import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CloudUpload, ExternalLink, TestTube } from 'lucide-react';
import { toast } from 'sonner';
import { configureLangfuse } from '@/lib/tracing';

const STORAGE_KEY = 'nexus.langfuse.config';

interface LangfuseConfig {
  url: string;
  publicKey: string;
  enabled: boolean;
}

function loadConfig(): LangfuseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LangfuseConfig;
  } catch {
    /* ignore */
  }
  return { url: 'https://cloud.langfuse.com', publicKey: '', enabled: false };
}

function saveConfig(cfg: LangfuseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

/**
 * Hydrate global tracing config from localStorage on module load.
 * Only runs once when the file is first imported by the app.
 */
export function bootstrapLangfuseExporter(): void {
  const cfg = loadConfig();
  if (cfg.enabled && cfg.url && cfg.publicKey) {
    configureLangfuse(cfg.url, cfg.publicKey);
  }
}

export function LangfuseExporterDialog() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<LangfuseConfig>(() => loadConfig());
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) setCfg(loadConfig());
  }, [open]);

  const handleSave = () => {
    saveConfig(cfg);
    if (cfg.enabled && cfg.url && cfg.publicKey) {
      configureLangfuse(cfg.url, cfg.publicKey);
      toast.success('Exportador Langfuse ativado');
    } else {
      toast.info('Configuração salva (exportador desativado)');
    }
    setOpen(false);
  };

  const handleTest = async () => {
    if (!cfg.url || !cfg.publicKey) {
      toast.error('Preencha URL e Public Key antes de testar');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch(`${cfg.url.replace(/\/$/, '')}/api/public/health`, {
        method: 'GET',
        headers: { Authorization: `Basic ${btoa(`${cfg.publicKey}:`)}` },
      });
      if (res.ok) {
        toast.success('Conexão OK — Langfuse acessível');
      } else {
        toast.error(`Falha ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao conectar');
    } finally {
      setTesting(false);
    }
  };

  const active = cfg.enabled && !!cfg.publicKey;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CloudUpload className="h-3.5 w-3.5" />
          Langfuse
          {active && <Badge className="bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20 text-[9px]">ATIVO</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-primary" />
            Exportador Langfuse
          </DialogTitle>
          <DialogDescription>
            Envie os traces OpenTelemetry para o Langfuse para observabilidade avançada e comparação de execuções.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/40">
            <div>
              <p className="text-body-sm font-semibold text-foreground">Exportação habilitada</p>
              <p className="text-meta text-muted-foreground">Envia traces automaticamente ao concluir</p>
            </div>
            <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lf-url">URL do Langfuse</Label>
            <Input
              id="lf-url"
              placeholder="https://cloud.langfuse.com"
              value={cfg.url}
              onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lf-key">Public Key</Label>
            <Input
              id="lf-key"
              placeholder="pk-lf-..."
              value={cfg.publicKey}
              onChange={(e) => setCfg({ ...cfg, publicKey: e.target.value })}
            />
            <p className="text-meta text-muted-foreground">
              A public key é enviada do navegador. Para ambientes sensíveis, prefira um proxy backend.
            </p>
          </div>

          <a
            href="https://langfuse.com/docs/get-started"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-meta text-primary hover:underline"
          >
            Documentação Langfuse <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
            <TestTube className="h-3.5 w-3.5" />
            {testing ? 'Testando...' : 'Testar conexão'}
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
