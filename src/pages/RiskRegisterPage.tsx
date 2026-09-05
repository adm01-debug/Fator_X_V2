/**
 * Risk Register — enterprise GRC page.
 * Manages workspace-scoped risks with 5x5 heatmap, treatment tracking and review scheduling.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus, ShieldAlert, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspaceId } from '@/hooks/use-data';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { DbRow } from '@/types/dbRow';

type RiskCategory =
  | 'strategic'
  | 'operational'
  | 'technical'
  | 'security'
  | 'compliance'
  | 'financial'
  | 'reputational';
type RiskTreatment = 'accept' | 'mitigate' | 'transfer' | 'avoid';
type RiskStatus = 'identified' | 'assessed' | 'treated' | 'monitored' | 'closed';

interface Risk {
  id: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  likelihood: number;
  impact: number;
  inherent_score: number;
  residual_score: number | null;
  treatment: RiskTreatment;
  mitigation_plan: string | null;
  status: RiskStatus;
  next_review_due: string;
  created_at: string;
}

const CATEGORIES: RiskCategory[] = [
  'strategic',
  'operational',
  'technical',
  'security',
  'compliance',
  'financial',
  'reputational',
];
const TREATMENTS: RiskTreatment[] = ['accept', 'mitigate', 'transfer', 'avoid'];
const STATUSES: RiskStatus[] = ['identified', 'assessed', 'treated', 'monitored', 'closed'];

const statusColor: Record<RiskStatus, string> = {
  identified: 'bg-nexus-muted/40 text-foreground',
  assessed: 'bg-nexus-info/20 text-nexus-info',
  treated: 'bg-nexus-warning/20 text-nexus-warning',
  monitored: 'bg-nexus-primary/20 text-nexus-primary',
  closed: 'bg-nexus-success/20 text-nexus-success',
};

function scoreColor(score: number): string {
  if (score >= 20) return 'bg-nexus-danger/80 text-white';
  if (score >= 12) return 'bg-nexus-danger/50 text-white';
  if (score >= 6) return 'bg-nexus-warning/60 text-foreground';
  return 'bg-nexus-success/40 text-foreground';
}

export default function RiskRegisterPage() {
  const { data: workspaceId } = useWorkspaceId();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: risks = [], isLoading } = useQuery({
    queryKey: ['risk_register', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('risk_register')
        .select(
          'id, title, description, category, likelihood, impact, inherent_score, residual_score, treatment, mitigation_plan, status, next_review_due, created_at',
        )
        .eq('workspace_id', workspaceId!)
        .order('inherent_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Risk[];
    },
    enabled: !!workspaceId,
  });

  // Heatmap 5x5: matrix[likelihood - 1][impact - 1] = riscos abertos naquela célula
  const heatmap = useMemo(() => {
    const matrix: Risk[][][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => [] as Risk[]),
    );
    for (const r of risks) {
      if (r.status === 'closed') continue;
      const l = Math.min(5, Math.max(1, r.likelihood)) - 1;
      const i = Math.min(5, Math.max(1, r.impact)) - 1;
      matrix[l][i].push(r);
    }
    return matrix;
  }, [risks]);

  const stats = useMemo(() => {
    const open = risks.filter((r) => r.status !== 'closed');
    const critical = open.filter((r) => r.inherent_score >= 15);
    const overdue = open.filter((r) => new Date(r.next_review_due) < new Date());
    return {
      total: risks.length,
      open: open.length,
      critical: critical.length,
      overdue: overdue.length,
    };
  }, [risks]);

  const createRisk = useMutation({
    mutationFn: async (input: DbRow) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('não autenticado');
      const { error } = await supabase.from('risk_register').insert({
        workspace_id: workspaceId!,
        title: input.title,
        description: input.description || null,
        category: input.category,
        likelihood: input.likelihood,
        impact: input.impact,
        treatment: input.treatment,
        mitigation_plan: input.mitigation_plan || null,
        created_by: user.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Risco registrado');
      qc.invalidateQueries({ queryKey: ['risk_register'] });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RiskStatus }) => {
      const patch: { status: RiskStatus; closed_at?: string } = { status };
      if (status === 'closed') patch.closed_at = new Date().toISOString();
      const { error } = await supabase.from('risk_register').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status atualizado');
      qc.invalidateQueries({ queryKey: ['risk_register'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Registro de Riscos"
        description="Identifique, avalie e trate riscos operacionais, técnicos e de compliance com heatmap 5x5."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Risco
              </Button>
            </DialogTrigger>
            <NewRiskDialog
              onSubmit={(v) => createRisk.mutate(v)}
              isPending={createRisk.isPending}
            />
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ShieldAlert} label="Total" value={stats.total} tone="muted" />
        <StatCard icon={AlertTriangle} label="Abertos" value={stats.open} tone="warning" />
        <StatCard icon={TrendingUp} label="Críticos (≥15)" value={stats.critical} tone="danger" />
        <StatCard icon={Clock} label="Revisão Atrasada" value={stats.overdue} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-body">Matriz de Risco (Probabilidade × Impacto)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div
              className="inline-grid gap-1"
              style={{ gridTemplateColumns: 'auto repeat(5, minmax(64px, 1fr))' }}
            >
              <div />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={`h-${i}`} className="text-center text-meta text-muted-foreground pb-1">
                  Impacto {i}
                </div>
              ))}
              {[5, 4, 3, 2, 1].map((likelihood) => (
                <>
                  <div
                    key={`l-${likelihood}`}
                    className="text-meta text-muted-foreground pr-2 self-center whitespace-nowrap"
                  >
                    Prob. {likelihood}
                  </div>
                  {[1, 2, 3, 4, 5].map((impact) => {
                    const cell = heatmap[likelihood - 1][impact - 1];
                    const score = likelihood * impact;
                    return (
                      <div
                        key={`${likelihood}-${impact}`}
                        className={cn(
                          'rounded-md p-2 min-h-[64px] flex flex-col items-center justify-center text-meta font-medium',
                          scoreColor(score),
                        )}
                        title={`Score ${score} — ${cell.length} risco(s)`}
                      >
                        <span className="text-title-sm font-bold">{cell.length}</span>
                        <span className="opacity-80">score {score}</span>
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-body">Riscos Registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-body-sm text-muted-foreground">Carregando...</p>
          ) : risks.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              Nenhum risco registrado. Clique em "Novo Risco" para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Tratamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Revisão</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center rounded-md px-2 py-1 text-meta font-bold min-w-[32px]',
                          scoreColor(r.inherent_score),
                        )}
                      >
                        {r.inherent_score}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize text-body-sm">{r.treatment}</TableCell>
                    <TableCell>
                      <Badge className={cn('capitalize', statusColor[r.status])}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-meta text-muted-foreground">
                      {new Date(r.next_review_due).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Select
                        value={r.status}
                        onValueChange={(v) =>
                          updateStatus.mutate({ id: r.id, status: v as RiskStatus })
                        }
                      >
                        <SelectTrigger className="w-32 h-8 text-meta ml-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: 'muted' | 'warning' | 'danger' | 'success';
}

function StatCard({ icon: Icon, label, value, tone }: StatCardProps) {
  const toneClass = {
    muted: 'text-muted-foreground',
    warning: 'text-nexus-warning',
    danger: 'text-nexus-danger',
    success: 'text-nexus-success',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-meta text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <Icon className={cn('h-8 w-8', toneClass)} />
        </div>
      </CardContent>
    </Card>
  );
}

interface NewRiskDialogProps {
  onSubmit: (v: DbRow) => void;
  isPending: boolean;
}

function NewRiskDialog({ onSubmit, isPending }: NewRiskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RiskCategory>('technical');
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(3);
  const [treatment, setTreatment] = useState<RiskTreatment>('mitigate');
  const [mitigationPlan, setMitigationPlan] = useState('');

  const submit = () => {
    if (!title.trim()) {
      toast.error('Título obrigatório');
      return;
    }
    onSubmit({
      title,
      description,
      category,
      likelihood,
      impact,
      treatment,
      mitigation_plan: mitigationPlan,
    });
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Registrar Novo Risco</DialogTitle>
        <DialogDescription>
          Avalie probabilidade e impacto em escala 1-5. Score = probabilidade × impacto.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label>Título</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Exposição de chaves de API em logs"
          />
        </div>
        <div className="grid gap-2">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as RiskCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Probabilidade (1-5)</Label>
            <Select value={String(likelihood)} onValueChange={(v) => setLikelihood(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Impacto (1-5)</Label>
            <Select value={String(impact)} onValueChange={(v) => setImpact(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Tratamento</Label>
          <Select value={treatment} onValueChange={(v) => setTreatment(v as RiskTreatment)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TREATMENTS.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Plano de Mitigação</Label>
          <Textarea
            value={mitigationPlan}
            onChange={(e) => setMitigationPlan(e.target.value)}
            rows={3}
          />
        </div>
        <div className="rounded-md bg-muted p-3 flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-nexus-primary" />
          <span className="text-body-sm">
            Score inerente:{' '}
            <strong className={cn('px-2 py-0.5 rounded', scoreColor(likelihood * impact))}>
              {likelihood * impact}
            </strong>
          </span>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? 'Registrando...' : 'Registrar Risco'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
