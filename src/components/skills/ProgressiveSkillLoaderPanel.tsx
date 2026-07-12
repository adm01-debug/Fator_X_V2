/**
 * Progressive Skill Loader Panel
 * Painel interativo do progressiveSkillLoader — permite hidratar skills do DB,
 * simular carregamento progressivo para uma descrição de tarefa dentro de um
 * budget de tokens e visualizar analytics de uso.
 */
import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Database, BarChart3, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  hydrateSkillsFromDB,
  loadSkillsForTask,
  generateSkillPrompt,
  getSkillAnalytics,
  getAllSkills,
  type SkillLoadResult,
} from '@/services/progressiveSkillLoader';

export function ProgressiveSkillLoaderPanel() {
  const [task, setTask] = useState('');
  const [tokenBudget, setTokenBudget] = useState(4000);
  const [maxSkills, setMaxSkills] = useState(10);
  const [result, setResult] = useState<SkillLoadResult | null>(null);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [analyticsTick, setAnalyticsTick] = useState(0);

  useEffect(() => {
    setTotalRegistered(getAllSkills().length);
  }, [analyticsTick]);

  const analytics = useMemo(() => {
    void analyticsTick;
    return getSkillAnalytics().slice(0, 20);
  }, [analyticsTick]);

  async function handleHydrate() {
    setHydrating(true);
    try {
      const count = await hydrateSkillsFromDB();
      toast.success(`${count} skill(s) hidratada(s) do banco`);
      setAnalyticsTick((t) => t + 1);
    } catch (e) {
      toast.error(`Falha ao hidratar: ${(e as Error).message}`);
    } finally {
      setHydrating(false);
    }
  }

  function handleSimulate() {
    if (!task.trim()) {
      toast.error('Descreva a tarefa antes de simular');
      return;
    }
    if (getAllSkills().length === 0) {
      toast.warning('Nenhuma skill registrada — hidrate do banco primeiro');
      return;
    }
    const r = loadSkillsForTask(task, { tokenBudget, maxSkills });
    setResult(r);
    setAnalyticsTick((t) => t + 1);
    toast.success(
      `${r.loaded.length} skill(s) carregada(s) · ${r.totalTokens}/${tokenBudget} tokens`,
    );
  }

  const budgetPct = result ? Math.min(100, (result.totalTokens / tokenBudget) * 100) : 0;
  const prompt = result ? generateSkillPrompt(result) : '';

  return (
    <div className="nexus-card space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-heading-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Progressive Skill Loader
          </h3>
          <p className="text-meta text-muted-foreground mt-1">
            Carregamento hierárquico de skills por relevância semântica dentro de um budget de tokens.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" /> {totalRegistered} registrada(s)
          </Badge>
          <Button size="sm" variant="outline" onClick={handleHydrate} disabled={hydrating}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${hydrating ? 'animate-spin' : ''}`} />
            Hidratar do DB
          </Button>
        </div>
      </div>

      <Tabs defaultValue="simulate" className="w-full">
        <TabsList>
          <TabsTrigger value="simulate">
            <Zap className="h-3.5 w-3.5 mr-1" /> Simulador
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="simulate" className="space-y-4 mt-4">
          <div>
            <label className="text-meta font-medium text-foreground mb-1 block">
              Descrição da tarefa
            </label>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Ex: preciso analisar um CSV de vendas, extrair insights e gerar um relatório em PDF..."
              rows={3}
              className="bg-secondary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-meta font-medium text-foreground mb-1 block">
                Budget de tokens
              </label>
              <Input
                type="number"
                min={100}
                step={100}
                value={tokenBudget}
                onChange={(e) => setTokenBudget(Number(e.target.value) || 4000)}
                className="bg-secondary/50"
              />
            </div>
            <div>
              <label className="text-meta font-medium text-foreground mb-1 block">
                Máx. de skills
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxSkills}
                onChange={(e) => setMaxSkills(Number(e.target.value) || 10)}
                className="bg-secondary/50"
              />
            </div>
          </div>

          <Button onClick={handleSimulate} className="w-full">
            <Zap className="h-4 w-4 mr-1" />
            Simular carregamento
          </Button>

          {result && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">Estratégia: {result.strategy}</Badge>
                  <Badge variant="outline">{result.loaded.length} carregadas</Badge>
                  <Badge variant="outline">{result.skipped.length} ignoradas</Badge>
                </div>
                <span className="text-meta text-muted-foreground">
                  {result.totalTokens} / {tokenBudget} tokens
                </span>
              </div>
              <Progress value={budgetPct} className="h-2" />

              <div>
                <p className="text-meta font-medium text-foreground mb-2">
                  Skills carregadas ({result.loaded.length})
                </p>
                <ScrollArea className="h-[180px] rounded-md border border-border/50 bg-secondary/30 p-2">
                  {result.loaded.length === 0 ? (
                    <p className="text-meta text-muted-foreground p-2">
                      Nenhuma skill relevante encontrada para o budget informado.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {result.loaded.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2 text-body-sm px-2 py-1 rounded bg-background/60"
                        >
                          <span className="truncate">
                            <span className="font-medium">{s.name}</span>{' '}
                            <span className="text-muted-foreground text-meta">· {s.category}</span>
                          </span>
                          <Badge variant="outline" className="text-meta shrink-0">
                            {s.tokenCount}t
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>

              {prompt && (
                <details className="text-meta">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Ver prompt gerado ({prompt.length} chars)
                  </summary>
                  <ScrollArea className="h-[160px] mt-2 rounded-md border border-border/50 bg-secondary/30 p-2">
                    <pre className="text-meta whitespace-pre-wrap font-mono">{prompt}</pre>
                  </ScrollArea>
                </details>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <ScrollArea className="h-[320px] rounded-md border border-border/50 bg-secondary/30 p-2">
            {analytics.length === 0 ? (
              <p className="text-meta text-muted-foreground p-2">
                Sem dados de uso ainda. Rode simulações para gerar analytics.
              </p>
            ) : (
              <table className="w-full text-meta">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-2">Skill</th>
                    <th className="p-2">Categoria</th>
                    <th className="p-2 text-right">Usos</th>
                    <th className="p-2 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.map((a) => (
                    <tr key={a.id} className="border-t border-border/40">
                      <td className="p-2 font-medium truncate">{a.name}</td>
                      <td className="p-2 text-muted-foreground">{a.category}</td>
                      <td className="p-2 text-right">{a.useCount}</td>
                      <td className="p-2 text-right">{a.tokenCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
