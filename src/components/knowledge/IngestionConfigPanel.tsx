import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Settings2, Layers, Cpu, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function IngestionConfigPanel() {
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(200);

  return (
    <Card className="p-6 bg-card/30 border-border/40 space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Pipeline Tuning</h3>
            <p className="text-meta text-muted-foreground">Configure os parâmetros de ingestão neural</p>
          </div>
        </div>
        <Badge variant="outline" className="text-meta border-primary/20 text-primary">v2.4 (Active)</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Chunking Strategy */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-500" />
            <h4 className="text-meta font-black uppercase tracking-widest text-foreground">Chunking Strategy</h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-meta font-bold uppercase tracking-tight">Chunk Size: {chunkSize}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent>Tamanho máximo de cada segmento de texto em caracteres ou tokens.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Slider 
                value={[chunkSize]} 
                onValueChange={(v) => setChunkSize(v[0])} 
                max={4000} 
                min={100} 
                step={100} 
                className="py-2"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-meta font-bold uppercase tracking-tight">Overlap: {overlap}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                    <TooltipContent>Sobreposição entre chunks consecutivos para manter o contexto semântico.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Slider 
                value={[overlap]} 
                onValueChange={(v) => setOverlap(v[0])} 
                max={500} 
                min={0} 
                step={10} 
                className="py-2"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-meta font-bold uppercase tracking-tight">Splitter Type</Label>
              <Select defaultValue="recursive">
                <SelectTrigger className="bg-secondary/20 border-border/40 h-10">
                  <SelectValue placeholder="Select splitter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recursive">Recursive Character</SelectItem>
                  <SelectItem value="markdown">Markdown Aware</SelectItem>
                  <SelectItem value="code">Code (TS/Python)</SelectItem>
                  <SelectItem value="semantic">Semantic (AI-Driven)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Embedding & Normalization */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-nexus-amber" />
            <h4 className="text-meta font-black uppercase tracking-widest text-foreground">Neural Encoding</h4>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-meta font-bold uppercase tracking-tight">Embedding Model</Label>
              <Select defaultValue="text-embedding-3-small">
                <SelectTrigger className="bg-secondary/20 border-border/40 h-10">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text-embedding-3-small">OpenAI v3 Small (1536d)</SelectItem>
                  <SelectItem value="text-embedding-3-large">OpenAI v3 Large (3072d)</SelectItem>
                  <SelectItem value="multilingual-e5-large">Cohere Multilingual (1024d)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-meta font-bold uppercase tracking-tight">L2 Normalization</Label>
                <Switch defaultChecked />
              </div>
              <p className="text-meta text-muted-foreground">Normaliza vetores para busca por similaridade de cosseno.</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-meta font-bold uppercase tracking-tight">Rerank Filter</Label>
                <Switch defaultChecked />
              </div>
              <p className="text-meta text-muted-foreground">Adiciona camada secundária de precisão após a recuperação vetorial.</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
