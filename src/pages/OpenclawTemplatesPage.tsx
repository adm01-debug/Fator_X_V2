/**
 * OpenclawTemplatesPage — Galeria de templates de agentes OpenClaw.
 * Baseado no repositório awesome-openclaw-usecases-zh.
 */
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Clock, Radio, ExternalLink, Rocket } from 'lucide-react';
import {
  useOpenclawTemplates,
  type OpenclawTemplate,
  type OpenclawTemplateCategory,
} from '@/hooks/useOpenclawTemplates';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const CATEGORIES: { key: OpenclawTemplateCategory | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'produtividade', label: 'Produtividade' },
  { key: 'vendas', label: 'Vendas' },
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'observabilidade', label: 'Observabilidade' },
  { key: 'conteudo', label: 'Conteúdo' },
  { key: 'pessoal', label: 'Pessoal' },
];

function difficultyLabel(d: 1 | 2 | 3) {
  return '⭐'.repeat(d);
}

export default function OpenclawTemplatesPage() {
  const [category, setCategory] = useState<OpenclawTemplateCategory | 'todas'>('todas');
  const [selected, setSelected] = useState<OpenclawTemplate | null>(null);
  const navigate = useNavigate();

  const { data, isLoading, error } = useOpenclawTemplates({ category });

  const templates = useMemo(() => data ?? [], [data]);

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Galeria de Templates OpenClaw"
        description="Receitas prontas de agentes multi-canal inspiradas em awesome-openclaw-usecases. Clique em um card para ver o SOUL/AGENTS e implantar."
      />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Button
            key={c.key}
            size="sm"
            variant={category === c.key ? 'default' : 'outline'}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Falha ao carregar templates: {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            <Sparkles className="mx-auto mb-3 h-8 w-8 opacity-50" />
            Nenhum template disponível nesta categoria ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card
              key={t.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-lg hover:border-primary/50',
              )}
              onClick={() => setSelected(t)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.name_pt}</CardTitle>
                  <Badge variant="outline" className="shrink-0">
                    {difficultyLabel(t.difficulty)}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-3">{t.description_pt}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Badge variant="secondary" className="capitalize">
                  {t.category}
                </Badge>
                {t.cron_schedule && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {t.cron_schedule}
                  </Badge>
                )}
                {t.required_channels.map((ch) => (
                  <Badge key={ch} variant="secondary" className="gap-1 capitalize">
                    <Radio className="h-3 w-3" />
                    {ch}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.name_pt}
                  <Badge variant="outline">{difficultyLabel(selected.difficulty)}</Badge>
                </DialogTitle>
                <DialogDescription>{selected.description_pt}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {selected.category}
                </Badge>
                {selected.cron_schedule && (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    {selected.cron_schedule}
                  </Badge>
                )}
                {selected.required_channels.map((ch) => (
                  <Badge key={ch} variant="secondary" className="gap-1 capitalize">
                    <Radio className="h-3 w-3" />
                    {ch}
                  </Badge>
                ))}
              </div>

              {selected.soul_md && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">SOUL.md</h3>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                    {selected.soul_md}
                  </pre>
                </section>
              )}

              {selected.agents_md && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">AGENTS.md</h3>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                    {selected.agents_md}
                  </pre>
                </section>
              )}

              {selected.skills.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold mb-2">Skills necessárias</h3>
                  <ul className="text-sm space-y-1">
                    {selected.skills.map((s) => (
                      <li key={s.name} className="flex items-center gap-2">
                        <Badge variant={s.required ? 'default' : 'outline'}>
                          {s.required ? 'obrigatória' : 'opcional'}
                        </Badge>
                        <span className="capitalize">{s.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t">
                {selected.source_url ? (
                  <a
                    href={selected.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Fonte original
                  </a>
                ) : (
                  <span />
                )}
                <Button
                  onClick={() => {
                    navigate('/openclaw', { state: { templateSlug: selected.slug } });
                    setSelected(null);
                  }}
                >
                  <Rocket className="h-4 w-4 mr-2" />
                  Implantar no Runtime
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
