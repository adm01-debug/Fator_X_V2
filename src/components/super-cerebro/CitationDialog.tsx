import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink } from 'lucide-react';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { getCachedSignedUrl } from '@/lib/signedUrlCache';
import { toast } from 'sonner';
import { useState } from 'react';
import type { CerebroCitation } from '@/types/cerebroCitations';
import { logger } from '@/lib/logger';

interface CitationDialogProps {
  citation: CerebroCitation | null;
  onOpenChange: (open: boolean) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CitationDialog({ citation, onOpenChange }: CitationDialogProps) {
  const [loading, setLoading] = useState(false);
  const open = citation !== null;

  const handleOpenDocument = async () => {
    if (!citation?.document_id || !UUID_RE.test(citation.document_id)) {
      toast.error('Documento inválido');
      return;
    }
    setLoading(true);
    try {
      const { data: doc, error } = await supabaseExternal
        .from('documents')
        .select('metadata, source_url')
        .eq('id', citation.document_id)
        .maybeSingle();
      if (error) throw error;

      const md = (doc?.metadata ?? {}) as { storage_path?: string; bucket?: string };
      const storagePath = md.storage_path;
      const bucket = md.bucket ?? 'knowledge-uploads';

      if (storagePath) {
        const signedUrl = await getCachedSignedUrl(bucket, storagePath);
        if (signedUrl) {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
          return;
        }
      }

      if (doc?.source_url) {
        window.open(doc.source_url, '_blank', 'noopener,noreferrer');
        return;
      }
      toast.info('Documento sem URL de origem disponível');
    } catch (e) {
      logger.error('cerebro.citation.open_failed', { error: e });
      toast.error('Não foi possível abrir o documento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Fonte [{citation?.n}]
          </DialogTitle>
          <DialogDescription className="text-foreground font-semibold text-base">
            {citation?.document_title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {citation?.notebook_name && (
              <Badge variant="secondary">Notebook: {citation.notebook_name}</Badge>
            )}
            {citation?.page != null && (
              <Badge variant="outline">Página {citation.page}</Badge>
            )}
            {citation?.section && (
              <Badge variant="outline">Seção: {citation.section}</Badge>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              Trecho usado
            </p>
            <p className="text-sm text-foreground leading-relaxed italic">
              "{citation?.snippet}"
            </p>
          </div>

          <Button
            onClick={handleOpenDocument}
            disabled={loading || !citation?.document_id}
            className="w-full gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            {loading ? 'Gerando link…' : 'Abrir documento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
