import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, RefreshCw, Play, Loader2, Plus, Calendar, Settings2 } from 'lucide-react';
import { listSchedules, runCronExecutor, CRON_PRESETS, getScheduleStats, describeCronExpression, createSchedule, type CronSchedule, type ScheduleStats } from '@/services/cronSchedulerService';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CronVisualEditor } from './CronVisualEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-nexus-emerald/20 text-nexus-emerald',
  paused: 'bg-nexus-amber/20 text-nexus-amber',
  completed: 'bg-nexus-blue/20 text-nexus-blue',
  failed: 'bg-destructive/20 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

export function CronSchedulerPanel() {
  const [schedules, setSchedules] = useState<CronSchedule[]>([]);
  const [stats, setStats] = useState<ScheduleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCron, setNewCron] = useState('* * * * *');
  const [saving, setSaving] = useState(false);
  const [targetType, setTargetType] = useState<CronSchedule['target_type']>('agent');
  const [targetId, setTargetId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedulesData, statsData] = await Promise.all([
        listSchedules(),
        getScheduleStats(),
      ]);
      setSchedules(schedulesData);
      setStats(statsData);
    } catch {
      toast({ title: 'Erro ao carregar agendamentos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunPending = async () => {
    setRunning(true);
    try {
      const result = await runCronExecutor();
      const count = result.results?.length ?? result.executed ?? 0;
      const succ = result.results?.filter(r => r.status === 'success').length ?? 0;
      toast({
        title: 'Cron-executor disparado',
        description: count
          ? `${count} agendamentos executados (${succ} ok)`
          : 'Nenhum agendamento pendente',
      });
      await loadData();
    } catch (e) {
      toast({
        title: 'Falha ao executar pendentes',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !targetId.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createSchedule({
        name: newName.trim(),
        frequency: 'cron',
        cron_expression: newCron,
        target_type: targetType as CronSchedule['target_type'],
        target_id: targetId.trim(),
      });
      toast({ title: 'Agendamento criado!' });
      setCreateOpen(false);
      setNewName('');
      setTargetId('');
      await loadData();
    } catch (e: unknown) {
      toast({ title: 'Erro ao criar', description: e instanceof Error ? e.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats?.total_schedules ?? 0, color: 'hsl(var(--nexus-blue))' },
          { label: 'Ativos', value: stats?.active_schedules ?? 0, color: 'hsl(var(--nexus-emerald))' },
          { label: 'Pausados', value: stats?.paused_schedules ?? 0, color: 'hsl(var(--nexus-yellow))' },
          { label: 'Taxa Sucesso', value: `${(stats?.success_rate ?? 0).toFixed(1)}%`, color: 'hsl(var(--nexus-purple))' },
        ].map((s, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-meta text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-title-sm font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Agendamentos
        </h3>
        <div className="flex gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="nexus-gradient-bg text-primary-foreground gap-1.5 h-9 rounded-xl font-bold">
                <Plus className="h-4 w-4" /> Novo Agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-border/40 p-8 shadow-nexus-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading font-black">Configurar Cron-Job</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 mt-4">
                <div className="space-y-2">
                  <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">Nome da Automação</Label>
                  <Input 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    placeholder="Ex: Sync de Estoque Diário" 
                    className="h-11 rounded-xl bg-secondary/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">Target Type</Label>
                    <Select value={targetType} onValueChange={(v) => setTargetType(v as CronSchedule['target_type'])}>
                      <SelectTrigger className="h-11 rounded-xl bg-secondary/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="workflow">Workflow</SelectItem>
                        <SelectItem value="agent">Agente</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">ID do Alvo</Label>
                    <Input 
                      value={targetId} 
                      onChange={(e) => setTargetId(e.target.value)} 
                      placeholder="UUID do recurso" 
                      className="h-11 rounded-xl bg-secondary/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                   <Label className="text-meta font-black uppercase text-muted-foreground tracking-widest">Editor Visual Cron</Label>
                   <CronVisualEditor value={newCron} onChange={setNewCron} />
                </div>

                <DialogFooter className="pt-4">
                  <Button variant="outline" onClick={() => setCreateOpen(false)} className="h-12 rounded-xl px-6">Cancelar</Button>
                  <Button onClick={handleCreate} disabled={saving} className="h-12 px-8 rounded-xl nexus-gradient-bg text-primary-foreground font-bold shadow-nexus-lg shadow-primary/20">
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Settings2 className="h-5 w-5" />}
                    <span className="ml-2">Ativar Job</span>
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRunPending}
            disabled={running}
            className="border-border hover:border-primary h-9 rounded-xl font-bold gap-1.5"
          >
            {running ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Play size={14} className="mr-1" />
            )}
            Executar Pendentes
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="border-border">
            <RefreshCw size={14} className="mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Presets */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3"><CardTitle className="text-body-sm text-muted-foreground">Presets Disponíveis</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CRON_PRESETS).map(([key, preset]) => (
              <Badge key={key} variant="outline" className="border-border text-meta cursor-pointer hover:bg-accent" title={preset.description}>
                <Clock size={10} className="mr-1 text-primary" />
                {preset.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Schedules List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando agendamentos...</div>
      ) : schedules.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock size={48} className="mx-auto mb-4 opacity-30" />
            <p>Nenhum agendamento criado ainda.</p>
            <p className="text-body-sm mt-1">Use os presets acima ou crie um agendamento personalizado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock size={18} className="text-primary" />
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-meta text-muted-foreground">
                        {s.cron_expression ? describeCronExpression(s.cron_expression) : s.frequency}
                        {s.next_run_at && ` • Próx: ${new Date(s.next_run_at).toLocaleString('pt-BR')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_COLORS[s.status] ?? 'bg-muted text-muted-foreground'}>
                      {s.status}
                    </Badge>
                    <span className="text-meta text-muted-foreground">{s.run_count} runs</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
