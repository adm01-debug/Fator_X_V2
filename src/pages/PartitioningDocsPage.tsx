/**
 * PartitioningDocsPage — Playbook interno de particionamento mensal.
 *
 * Fonte da verdade: docs/architecture/partitioning-assessment-2026-07-23.md
 *   e docs/architecture/partitioning.md
 *
 * Esta página expõe, dentro do produto, os gatilhos objetivos, o passo-a-passo
 * de conversão e as validações que preservam FKs e ON DELETE CASCADE. Está em
 * PT-BR e usa exclusivamente tokens semânticos do design system Nexus.
 */
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CodeBlock } from '@/components/agent-builder/ui/CodeBlock';
import { SectionTitle } from '@/components/agent-builder/ui/SectionTitle';
import { AlertTriangle, CheckCircle2, Database, GitBranch, ShieldCheck } from 'lucide-react';

interface PartitionRow {
  parent: string;
  coverage: string;
  retention: string;
  strategy: string;
}

const ACTIVE_PARTITIONS: PartitionRow[] = [
  { parent: 'agent_traces_v2', coverage: '2026-04 → 2027-07', retention: '90 dias', strategy: 'Drop + archive Parquet' },
  { parent: 'audit_log_v2', coverage: '2026-04 → 2027-07', retention: '365 dias', strategy: 'Drop + archive Parquet' },
  { parent: 'trace_events_v2', coverage: '2026-04 → 2027-07', retention: '30 dias', strategy: 'Drop' },
];

interface TriggerRow {
  metric: string;
  threshold: string;
  rationale: string;
}

const TRIGGERS: TriggerRow[] = [
  {
    metric: 'Volume total',
    threshold: '≥ 5 GB de disco OU ≥ 10 M linhas',
    rationale: 'Abaixo disso, o planner não se beneficia de particionamento — mantém-se em heap único.',
  },
  {
    metric: 'Latência de leitura recente',
    threshold: 'P95 de SELECT WHERE created_at > now() - 7 days ≥ 500 ms (com índice)',
    rationale: 'Sinal de bloat em índices btree e/ou heap fragmentado — particionar reduz o working set.',
  },
  {
    metric: 'Retenção operacional/legal',
    threshold: 'Exige remoção mensal periódica',
    rationale: 'DROP TABLE de partição é O(1) sem bloat; DELETE em massa gera dead tuples e VACUUM caro.',
  },
];

interface DeferredRow {
  table: string;
  rows: string;
  reason: string;
}

const DEFERRED: DeferredRow[] = [
  { table: 'usage_records', rows: '0', reason: 'Vazia — converter agora é retrabalho.' },
  { table: 'agent_usage', rows: '0', reason: 'Vazia.' },
  { table: 'openclaw_whatsapp_messages', rows: '0', reason: 'Vazia; FKs de entrada exigiriam PK composta.' },
  { table: 'openclaw_events', rows: '1', reason: 'Volume desprezível.' },
  { table: 'code_executions', rows: '0', reason: 'Vazia.' },
  { table: 'automation_logs', rows: '0', reason: 'Vazia.' },
  { table: 'webhook_events', rows: '0', reason: 'Vazia.' },
  { table: 'synthetic_results', rows: '0', reason: 'Vazia.' },
  { table: 'oracle_history', rows: '0', reason: 'Vazia.' },
  { table: 'agent_memories_v2', rows: '0', reason: 'Vazia; alvo forte quando cruzar gatilhos.' },
  { table: 'graph_executions', rows: '0', reason: 'Vazia.' },
];

const PLAYBOOK_SQL = `BEGIN;

-- 1. Rename da tabela original (mantém dados intactos)
ALTER TABLE public.<tabela> RENAME TO <tabela>_legacy;

-- 2. Cria a nova tabela particionada com PK composta (id, created_at)
--    A chave de partição PRECISA fazer parte da PK/UNIQUE.
CREATE TABLE public.<tabela> (
  LIKE public.<tabela>_legacy INCLUDING ALL EXCLUDING CONSTRAINTS EXCLUDING INDEXES
) PARTITION BY RANGE (created_at);

ALTER TABLE public.<tabela>
  ADD PRIMARY KEY (id, created_at);

-- 3. GRANTs + RLS + policies IDÊNTICOS à legacy
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabela> TO authenticated;
GRANT ALL ON public.<tabela> TO service_role;
ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ... (reaplicar todas as policies da legacy)

-- 4. Registrar no ensure_monthly_partitions
--    Adicionar '<tabela>' ao array v_parents em
--    internal.ensure_monthly_partitions(int) e materializar -3..+12.
SELECT internal.ensure_monthly_partitions(12);

-- 5. Backfill em lotes (evita long-running lock)
INSERT INTO public.<tabela>
SELECT * FROM public.<tabela>_legacy
WHERE created_at BETWEEN $1 AND $2;

-- 6. Cutover: validar contagens e DROP da legacy
SELECT
  (SELECT count(*) FROM public.<tabela>) AS novos,
  (SELECT count(*) FROM public.<tabela>_legacy) AS legado;
-- Só siga com DROP TABLE public.<tabela>_legacy quando os números baterem.

COMMIT;`;

const FK_INBOUND_SQL = `-- Alternativa recomendada quando outra tabela referencia esta:
-- Manter FK LÓGICA via trigger em vez de FK física, e documentar em
-- docs/DATA-DICTIONARY.md.

CREATE OR REPLACE FUNCTION public.fk_check_<tabela>()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.<coluna>_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.<tabela> WHERE id = NEW.<coluna>_id
  ) THEN
    RAISE foreign_key_violation USING
      MESSAGE = 'FK lógica violada: <tabela>.id não encontrado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_fk_<tabela>
BEFORE INSERT OR UPDATE ON public.<tabela_filha>
FOR EACH ROW EXECUTE FUNCTION public.fk_check_<tabela>();

-- ON DELETE CASCADE também vira trigger AFTER DELETE na pai.`;

const VALIDATION_SQL = `-- A. Partições existentes e faixas
SELECT
  child.relname AS partition,
  pg_get_expr(child.relpartbound, child.oid) AS bounds
FROM pg_inherits i
JOIN pg_class parent ON parent.oid = i.inhparent
JOIN pg_class child  ON child.oid  = i.inhrelid
WHERE parent.relname = '<tabela>'
ORDER BY child.relname;

-- B. RLS ativa em TODAS as partições filhas (herança do Postgres 15+)
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename LIKE '<tabela>_%'
ORDER BY tablename;
-- Esperado: rowsecurity = true em 100%.

-- C. Health check dos jobs de manutenção
SELECT * FROM internal.check_partition_health();

-- D. Confirmar plano usando partition pruning
EXPLAIN (VERBOSE)
SELECT * FROM public.<tabela>
WHERE created_at >= date_trunc('month', now())
LIMIT 10;
-- Esperado: apenas a partição do mês corrente aparece no plano.`;

export default function PartitioningDocsPage() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <PageHeader
        title="Playbook de Particionamento"
        description="Gatilhos objetivos, passo-a-passo de conversão e validações que preservam FKs e ON DELETE CASCADE."
      />

      {/* Estado atual */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            title="Estado atual"
            subtitle="Famílias já particionadas por PARTITION BY RANGE (created_at) mensal — cobertura de 12 meses à frente garantida via pg_cron."
            badge={<Badge variant="secondary" className="text-meta">3 famílias</Badge>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm text-numeric">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Tabela pai</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Cobertura</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Retenção</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Estratégia</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_PARTITIONS.map((row) => (
                  <tr key={row.parent} className="border-t border-border/40 hover:bg-secondary/20">
                    <td className="p-3"><code className="text-meta font-mono text-primary">{row.parent}</code></td>
                    <td className="p-3">{row.coverage}</td>
                    <td className="p-3">{row.retention}</td>
                    <td className="p-3 text-muted-foreground">{row.strategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-caption text-muted-foreground">
            Job <code className="text-meta font-mono">ensure-monthly-partitions</code> executa dia 1 às 03:00 UTC via <code className="text-meta font-mono">pg_cron</code> com <code className="text-meta font-mono">p_months_ahead =&gt; 12</code>. Health-check auto-cura lacunas.
          </p>
        </CardContent>
      </Card>

      {/* Gatilhos objetivos */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            icon="⚡"
            title="Gatilhos para particionar uma nova tabela"
            subtitle="Somente converter quando pelo menos UM destes critérios for atingido. Antes disso, o custo de manutenção supera o ganho."
          />
          <div className="grid gap-3">
            {TRIGGERS.map((t) => (
              <div key={t.metric} className="rounded-lg border border-border bg-card p-4 hover-lift">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-nexus-warning" />
                  <h3 className="text-title-sm font-heading">{t.metric}</h3>
                </div>
                <p className="text-body-sm mt-1"><span className="font-medium text-foreground">Limiar:</span> <span className="text-numeric">{t.threshold}</span></p>
                <p className="text-caption text-muted-foreground mt-1">{t.rationale}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Candidatas adiadas */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            icon="🕒"
            title="Candidatas monitoradas (adiadas)"
            subtitle="Avaliadas em 23/07/2026 — todas vazias. Reavaliação automática quando cruzarem os gatilhos acima."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead className="bg-secondary/50 border-b border-border">
                <tr>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Tabela</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Linhas</th>
                  <th className="text-left p-3 text-meta uppercase tracking-wide text-muted-foreground">Motivo do adiamento</th>
                </tr>
              </thead>
              <tbody>
                {DEFERRED.map((row) => (
                  <tr key={row.table} className="border-t border-border/40">
                    <td className="p-3"><code className="text-meta font-mono">{row.table}</code></td>
                    <td className="p-3 text-numeric text-muted-foreground">{row.rows}</td>
                    <td className="p-3 text-muted-foreground">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Regra de ouro FK/CASCADE */}
      <Alert className="border-nexus-warning/40">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle className="font-heading">Regra de ouro — FKs e ON DELETE CASCADE</AlertTitle>
        <AlertDescription className="space-y-2 text-body-sm">
          <p><strong>FK saindo</strong> da tabela particionada para pai regular: funciona sem alteração — o pai não precisa ser particionado.</p>
          <p><strong>FK entrando</strong> na tabela particionada: Postgres exige referência à PK composta <code className="text-meta font-mono">(id, created_at)</code>. Alternativas aceitas: (a) adicionar coluna denormalizada <code className="text-meta font-mono">*_created_at</code> na filha e usar FK composta; (b) FK lógica via trigger — ver bloco SQL abaixo.</p>
          <p><strong>CASCADE dentro da mesma família</strong> (ex.: <code className="text-meta font-mono">trace_events_v2</code> → <code className="text-meta font-mono">agent_traces_v2</code>): resolvido nativamente via chave composta <code className="text-meta font-mono">(trace_id, created_at)</code>.</p>
        </AlertDescription>
      </Alert>

      {/* Playbook SQL */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            icon="📘"
            title="Playbook — conversão passo-a-passo"
            subtitle="Executar em janela de manutenção. Todos os passos dentro de uma transação, exceto o backfill (que pode ser em lotes fora do BEGIN/COMMIT se a tabela for muito grande)."
            badge={<Badge className="text-meta gap-1"><GitBranch className="h-3 w-3" /> 6 passos</Badge>}
          />
          <ol className="space-y-2 text-body-sm">
            <li><strong>1.</strong> Renomeia a tabela original para <code className="text-meta font-mono">_legacy</code>.</li>
            <li><strong>2.</strong> Cria nova tabela <code className="text-meta font-mono">PARTITION BY RANGE (created_at)</code> com PK composta <code className="text-meta font-mono">(id, created_at)</code>.</li>
            <li><strong>3.</strong> Reaplica GRANTs, habilita RLS e recria todas as policies da legacy.</li>
            <li><strong>4.</strong> Adiciona a tabela ao array <code className="text-meta font-mono">v_parents</code> em <code className="text-meta font-mono">internal.ensure_monthly_partitions(int)</code> e materializa as partições -3..+12.</li>
            <li><strong>5.</strong> Backfill em lotes por faixa de <code className="text-meta font-mono">created_at</code> — evita long-running lock.</li>
            <li><strong>6.</strong> Cutover: valida contagens legado × novo, depois <code className="text-meta font-mono">DROP TABLE _legacy</code>.</li>
          </ol>
          <CodeBlock code={PLAYBOOK_SQL} language="sql" maxHeight="480px" />
        </CardContent>
      </Card>

      {/* FKs de entrada */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            icon="🔗"
            title="Preservando FKs de entrada"
            subtitle="Padrão trigger-based quando não é viável propagar created_at para todas as filhas."
          />
          <CodeBlock code={FK_INBOUND_SQL} language="sql" maxHeight="360px" />
        </CardContent>
      </Card>

      {/* Validações */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-4">
          <SectionTitle
            icon="✅"
            title="Validações pós-conversão"
            subtitle="Rodar TODAS as consultas abaixo antes de considerar a conversão concluída."
            badge={<Badge variant="secondary" className="text-meta gap-1"><CheckCircle2 className="h-3 w-3" /> obrigatório</Badge>}
          />
          <ul className="space-y-2 text-body-sm">
            <li><strong>A.</strong> Partições materializadas cobrem 12 meses à frente e 3 meses atrás.</li>
            <li><strong>B.</strong> RLS herdada — 100% das partições filhas retornam <code className="text-meta font-mono">rowsecurity = true</code>.</li>
            <li><strong>C.</strong> <code className="text-meta font-mono">internal.check_partition_health()</code> retorna zero lacunas.</li>
            <li><strong>D.</strong> Partition pruning ativo — o plano só toca a partição da faixa consultada.</li>
          </ul>
          <CodeBlock code={VALIDATION_SQL} language="sql" maxHeight="420px" />
        </CardContent>
      </Card>

      {/* Monitoramento */}
      <Card className="nexus-card">
        <CardContent className="p-6 space-y-3">
          <SectionTitle icon="📡" title="Monitoramento contínuo" />
          <ul className="space-y-2 text-body-sm">
            <li className="flex items-start gap-2">
              <Database className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span><strong>System Jobs:</strong> status do cron e alerta automático se <code className="text-meta font-mono">check_partition_health()</code> reportar lacuna.</span>
            </li>
            <li className="flex items-start gap-2">
              <Database className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Métrica semanal:</strong> <code className="text-meta font-mono">pg_stat_user_tables.n_live_tup</code> das candidatas exportada para reavaliação de gatilhos.</span>
            </li>
            <li className="flex items-start gap-2">
              <Database className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span><strong>Revisão:</strong> este playbook é revisitado a cada 90 dias — ver <code className="text-meta font-mono">docs/architecture/partitioning-assessment-2026-07-23.md</code>.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
