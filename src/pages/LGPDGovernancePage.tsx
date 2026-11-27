import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Plus, ShieldAlert, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useRBAC } from '@/hooks/useRBAC';
import { getWorkspaceId } from '@/lib/agentService';
import { ConsentPanel } from '@/components/lgpd/ConsentPanel';
import {
  DSAR_DEADLINE_DAYS,
  createProcessingOperation,
  createSubjectRequest,
  getLgpdSettings,
  listBreaches,
  listPersonalDataInventory,
  listProcessingOperations,
  listRetentionPolicies,
  listSubjectRequests,
  respondSubjectRequest,
  saveLgpdSettings,
  saveRetentionPolicy,
  type ProcessingOperation,
  type SubjectRequestStatus,
  type SubjectRequestType,
} from '@/services/lgpdGovernanceService';

const REQUEST_LABELS: Record<SubjectRequestType, string> = {
  access: 'Acesso aos dados (Art. 18 I)',
  rectification: 'Correção de dados (Art. 18 III)',
  deletion: 'Eliminação de dados (Art. 18 VI)',
  portability: 'Portabilidade (Art. 18 V)',
  information: 'Informações sobre compartilhamento (Art. 18 I)',
  consent_revocation: 'Revogação de consentimento (Art. 18 IX)',
  objection: 'Oposição ao tratamento (Art. 18 §2)',
};

const STATUS_LABELS: Record<SubjectRequestStatus, string> = {
  received: 'Recebida',
  processing: 'Em análise',
  completed: 'Concluída',
  denied: 'Recusada',
  partial: 'Parcial',
};

const LEGAL_BASIS_LABELS: Record<string, string> = {
  consent: 'Consentimento (Art. 7 I)',
  legitimate_interest: 'Legítimo interesse (Art. 7 IX)',
  contract: 'Execução de contrato (Art. 7 V)',
  legal_obligation: 'Obrigação legal (Art. 7 II)',
  public_interest: 'Interesse público (Art. 7 III)',
  defense_claim: 'Proteção ao crédito (Art. 7 X)',
};

const RISK_TONE: Record<string, string> = {
  low: 'bg-nexus-emerald/15 text-nexus-emerald border-nexus-emerald/30',
  medium: 'bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30',
  high: 'bg-nexus-orange/15 text-nexus-orange border-nexus-orange/30',
  critical: 'bg-nexus-red/15 text-nexus-red border-nexus-red/30',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

function isOverdue(deadline: string, status: SubjectRequestStatus): boolean {
  return (status === 'received' || status === 'processing') && new Date(deadline).getTime() < Date.now();
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-meta text-muted-foreground text-center py-8">{children}</p>;
}

function Failure({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-meta text-destructive">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{error instanceof Error ? error.message : 'Falha ao carregar os dados'}</span>
    </div>
  );
}

export default function LGPDGovernancePage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useRBAC();

  const { data: workspaceId = null } = useQuery({
    queryKey: ['lgpd_governance_workspace'],
    queryFn: async () => {
      try {
        return await getWorkspaceId();
      } catch {
        return null;
      }
    },
  });

  // ── Solicitações do titular ────────────────────────────────────
  const requests = useQuery({
    queryKey: ['lgpd_subject_requests', workspaceId],
    queryFn: () => listSubjectRequests(workspaceId),
  });
  const [requestType, setRequestType] = useState<SubjectRequestType>('access');
  const [requestDescription, setRequestDescription] = useState('');

  const createRequest = useMutation({
    mutationFn: () =>
      createSubjectRequest({
        workspaceId,
        requestType,
        description: requestDescription,
      }),
    onSuccess: () => {
      toast.success(`Solicitação aberta — resposta em até ${DSAR_DEADLINE_DAYS} dias`);
      setRequestDescription('');
      queryClient.invalidateQueries({ queryKey: ['lgpd_subject_requests'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao abrir a solicitação'),
  });

  const answerRequest = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SubjectRequestStatus }) =>
      respondSubjectRequest(id, status),
    onSuccess: () => {
      toast.success('Solicitação atualizada');
      queryClient.invalidateQueries({ queryKey: ['lgpd_subject_requests'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao atualizar'),
  });

  // ── Registro de operações (ROPA) ───────────────────────────────
  const operations = useQuery({
    queryKey: ['lgpd_processing_register', workspaceId],
    queryFn: () => listProcessingOperations(workspaceId),
  });
  const [operation, setOperation] = useState({
    dataCategory: 'personal' as ProcessingOperation['data_category'],
    dataType: '',
    processingPurpose: '',
    legalBasis: 'consent',
    riskLevel: 'medium' as ProcessingOperation['risk_level'],
    retentionPeriod: '',
    description: '',
  });

  const createOperation = useMutation({
    mutationFn: () => createProcessingOperation({ workspaceId, ...operation }),
    onSuccess: () => {
      toast.success('Operação registrada');
      setOperation((prev) => ({ ...prev, dataType: '', processingPurpose: '', retentionPeriod: '', description: '' }));
      queryClient.invalidateQueries({ queryKey: ['lgpd_processing_register'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao registrar'),
  });

  // ── Incidentes ─────────────────────────────────────────────────
  const breaches = useQuery({
    queryKey: ['lgpd_breaches', workspaceId],
    queryFn: () => listBreaches(workspaceId),
  });

  // ── Retenção ───────────────────────────────────────────────────
  const retention = useQuery({
    queryKey: ['lgpd_retention', workspaceId],
    queryFn: () => listRetentionPolicies(workspaceId),
  });
  const [policy, setPolicy] = useState({ dataType: '', retentionDays: '', autoAnonymize: false });

  const savePolicy = useMutation({
    mutationFn: () =>
      saveRetentionPolicy({
        workspaceId,
        dataType: policy.dataType,
        retentionDays: Number(policy.retentionDays),
        autoAnonymize: policy.autoAnonymize,
      }),
    onSuccess: () => {
      toast.success('Política de retenção salva');
      setPolicy({ dataType: '', retentionDays: '', autoAnonymize: false });
      queryClient.invalidateQueries({ queryKey: ['lgpd_retention'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar'),
  });

  // ── Inventário de dados pessoais ───────────────────────────────
  const inventory = useQuery({
    queryKey: ['lgpd_inventory', workspaceId],
    queryFn: () => listPersonalDataInventory(workspaceId),
  });

  // ── Configurações ──────────────────────────────────────────────
  const settings = useQuery({
    queryKey: ['lgpd_settings', workspaceId],
    queryFn: () => (workspaceId ? getLgpdSettings(workspaceId) : Promise.resolve(null)),
    enabled: !!workspaceId,
  });
  const [dpo, setDpo] = useState({ name: '', email: '', phone: '' });

  const saveSettings = useMutation({
    mutationFn: () =>
      saveLgpdSettings(workspaceId as string, {
        dpo_name: dpo.name.trim() || null,
        dpo_email: dpo.email.trim() || null,
        dpo_phone: dpo.phone.trim() || null,
        notify_anpd_on_breach: true,
      }),
    onSuccess: () => {
      toast.success('Configurações de LGPD salvas');
      queryClient.invalidateQueries({ queryKey: ['lgpd_settings'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar'),
  });

  const overdueCount = (requests.data ?? []).filter((r) => isOverdue(r.deadline_at, r.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Governança LGPD"
        description="Registro de operações, solicitações do titular, incidentes e retenção — os prazos legais em um só lugar."
      />

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-meta text-destructive">
          <Timer className="h-4 w-4" />
          {overdueCount} solicitação(ões) do titular com prazo de 15 dias vencido.
        </div>
      )}

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="requests">Solicitações</TabsTrigger>
          <TabsTrigger value="register">Registro (ROPA)</TabsTrigger>
          <TabsTrigger value="inventory">Inventário</TabsTrigger>
          <TabsTrigger value="breaches">Incidentes</TabsTrigger>
          <TabsTrigger value="retention">Retenção</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground">Abrir solicitação</h3>
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
              <div className="space-y-1">
                <Label className="text-meta">Tipo</Label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as SubjectRequestType)}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-2 text-meta text-foreground"
                >
                  {Object.entries(REQUEST_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Detalhe (opcional)</Label>
                <Input
                  value={requestDescription}
                  onChange={(e) => setRequestDescription(e.target.value)}
                  placeholder="O que você precisa?"
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <Button
                size="sm"
                onClick={() => createRequest.mutate()}
                disabled={createRequest.isPending}
                className="gap-1"
              >
                {createRequest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Abrir
              </Button>
            </div>
            <p className="text-meta text-muted-foreground">
              A LGPD garante resposta em até {DSAR_DEADLINE_DAYS} dias (Art. 18 §1).
            </p>
          </div>

          {requests.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : requests.error ? (
            <Failure error={requests.error} />
          ) : (requests.data ?? []).length === 0 ? (
            <Empty>Nenhuma solicitação registrada.</Empty>
          ) : (
            <div className="space-y-2">
              {(requests.data ?? []).map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-secondary/30 p-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-meta font-medium text-foreground">{REQUEST_LABELS[r.request_type]}</p>
                    {r.description && <p className="text-meta text-muted-foreground">{r.description}</p>}
                    <p className="text-meta text-muted-foreground/60">
                      Aberta em {formatDate(r.created_at)} · prazo {formatDate(r.deadline_at)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={isOverdue(r.deadline_at, r.status) ? RISK_TONE.critical : 'border-border/40 text-muted-foreground'}
                  >
                    {STATUS_LABELS[r.status]}
                  </Badge>
                  <select
                    value={r.status}
                    onChange={(e) => answerRequest.mutate({ id: r.id, status: e.target.value as SubjectRequestStatus })}
                    disabled={!isAdmin || answerRequest.isPending}
                    title={isAdmin ? 'Atualizar andamento' : 'Somente administradores respondem'}
                    className="h-8 rounded-md border border-input bg-secondary/50 px-2 text-meta text-foreground disabled:opacity-50"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <ConsentPanel workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="register" className="space-y-4">
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground">Nova operação de tratamento</h3>
            {!isAdmin && (
              <p className="text-meta text-muted-foreground">Somente administradores do workspace podem registrar operações.</p>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-meta">Categoria</Label>
                <select
                  value={operation.dataCategory}
                  onChange={(e) => setOperation({ ...operation, dataCategory: e.target.value as ProcessingOperation['data_category'] })}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-2 text-meta text-foreground"
                >
                  <option value="personal">Dado pessoal</option>
                  <option value="sensitive">Dado sensível (Art. 5 II)</option>
                  <option value="children">Criança/adolescente</option>
                  <option value="anonymized">Anonimizado</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Tipo de dado</Label>
                <Input
                  value={operation.dataType}
                  onChange={(e) => setOperation({ ...operation, dataType: e.target.value })}
                  placeholder="email, cpf, histórico de compras"
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Finalidade</Label>
                <Input
                  value={operation.processingPurpose}
                  onChange={(e) => setOperation({ ...operation, processingPurpose: e.target.value })}
                  placeholder="treino de agente, analytics"
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Base legal</Label>
                <select
                  value={operation.legalBasis}
                  onChange={(e) => setOperation({ ...operation, legalBasis: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-2 text-meta text-foreground"
                >
                  {Object.entries(LEGAL_BASIS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Risco</Label>
                <select
                  value={operation.riskLevel}
                  onChange={(e) => setOperation({ ...operation, riskLevel: e.target.value as ProcessingOperation['risk_level'] })}
                  className="w-full h-9 rounded-md border border-input bg-secondary/50 px-2 text-meta text-foreground"
                >
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                  <option value="critical">Crítico</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Retenção</Label>
                <Input
                  value={operation.retentionPeriod}
                  onChange={(e) => setOperation({ ...operation, retentionPeriod: e.target.value })}
                  placeholder="90 dias, 5 anos"
                  className="bg-secondary/50 text-meta"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => createOperation.mutate()}
              disabled={!isAdmin || createOperation.isPending || !operation.dataType.trim() || !operation.processingPurpose.trim()}
              className="gap-1"
            >
              {createOperation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Registrar
            </Button>
          </div>

          {operations.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : operations.error ? (
            <Failure error={operations.error} />
          ) : (operations.data ?? []).length === 0 ? (
            <Empty>Nenhuma operação registrada — o Art. 37 exige este registro.</Empty>
          ) : (
            <div className="space-y-2">
              {(operations.data ?? []).map((op) => (
                <div key={op.id} className="rounded-lg border border-border/30 bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-meta font-medium text-foreground">{op.data_type}</p>
                    <Badge variant="outline" className={RISK_TONE[op.risk_level]}>{op.risk_level}</Badge>
                    <Badge variant="outline" className="border-border/40 text-muted-foreground">{op.data_category}</Badge>
                  </div>
                  <p className="text-meta text-muted-foreground">
                    {op.processing_purpose} · {LEGAL_BASIS_LABELS[op.legal_basis] ?? op.legal_basis}
                    {op.retention_period ? ` · retenção ${op.retention_period}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          {inventory.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : inventory.error ? (
            <Failure error={inventory.error} />
          ) : (inventory.data ?? []).length === 0 ? (
            <Empty>Nenhum campo de dado pessoal mapeado.</Empty>
          ) : (
            <div className="space-y-2">
              {(inventory.data ?? []).map((field) => (
                <div key={field.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-secondary/30 p-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-meta font-mono text-foreground">{field.table_name}.{field.column_name}</p>
                    <p className="text-meta text-muted-foreground">
                      {field.data_category}{field.purpose ? ` · ${field.purpose}` : ''}
                      {field.retention_days ? ` · ${field.retention_days} dias` : ''}
                    </p>
                  </div>
                  {field.is_sensitive && <Badge variant="outline" className={RISK_TONE.critical}>sensível</Badge>}
                  <Badge variant="outline" className={RISK_TONE[field.sensitivity_level]}>{field.sensitivity_level}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="breaches" className="space-y-4">
          <p className="text-meta text-muted-foreground">
            Incidentes são gravados pelo serviço de segurança (exige service role); aqui ficam visíveis para o
            administrador acompanhar prazos da ANPD (Art. 48).
          </p>
          {breaches.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : breaches.error ? (
            <Failure error={breaches.error} />
          ) : (breaches.data ?? []).length === 0 ? (
            <Empty>Nenhum incidente registrado.</Empty>
          ) : (
            <div className="space-y-2">
              {(breaches.data ?? []).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-secondary/30 p-3">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-meta font-medium text-foreground">{b.breach_type}</p>
                    <p className="text-meta text-muted-foreground">{b.description}</p>
                    <p className="text-meta text-muted-foreground/60">
                      Detectado em {formatDate(b.detection_at)}
                      {b.affected_users_count ? ` · ${b.affected_users_count} usuário(s)` : ''}
                      {b.notification_to_authority_at ? ` · ANPD em ${formatDate(b.notification_to_authority_at)}` : ' · ANPD não notificada'}
                    </p>
                  </div>
                  <Badge variant="outline" className={RISK_TONE[b.severity]}>{b.severity}</Badge>
                  <Badge variant="outline" className="border-border/40 text-muted-foreground">{b.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="retention" className="space-y-4">
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground">Nova política de retenção</h3>
            {!isAdmin && (
              <p className="text-meta text-muted-foreground">Somente administradores do workspace podem definir retenção.</p>
            )}
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto_auto] md:items-end">
              <div className="space-y-1">
                <Label className="text-meta">Tipo de dado</Label>
                <Input
                  value={policy.dataType}
                  onChange={(e) => setPolicy({ ...policy, dataType: e.target.value })}
                  placeholder="chat_messages, agent_logs, audit_log"
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Dias</Label>
                <Input
                  type="number"
                  min={1}
                  value={policy.retentionDays}
                  onChange={(e) => setPolicy({ ...policy, retentionDays: e.target.value })}
                  placeholder="365"
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <label className="flex items-center gap-2 text-meta text-muted-foreground h-9">
                <input
                  type="checkbox"
                  checked={policy.autoAnonymize}
                  onChange={(e) => setPolicy({ ...policy, autoAnonymize: e.target.checked })}
                />
                Anonimizar
              </label>
              <Button
                size="sm"
                onClick={() => savePolicy.mutate()}
                disabled={!isAdmin || savePolicy.isPending || !policy.dataType.trim() || !Number(policy.retentionDays)}
                className="gap-1"
              >
                {savePolicy.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </div>

          {retention.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : retention.error ? (
            <Failure error={retention.error} />
          ) : (retention.data ?? []).length === 0 ? (
            <Empty>Nenhuma política de retenção definida.</Empty>
          ) : (
            <div className="space-y-2">
              {(retention.data ?? []).map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/30 bg-secondary/30 p-3">
                  <p className="text-meta font-mono text-foreground flex-1">{p.data_type}</p>
                  <span className="text-meta text-muted-foreground">{p.retention_days} dias</span>
                  {p.auto_anonymize && <Badge variant="outline" className="border-border/40 text-muted-foreground">anonimiza</Badge>}
                  <Badge variant="outline" className={p.is_active ? RISK_TONE.low : 'border-border/40 text-muted-foreground'}>
                    {p.is_active ? 'ativa' : 'inativa'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground">Encarregado de dados (DPO)</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-meta">Nome</Label>
                <Input
                  value={dpo.name}
                  onChange={(e) => setDpo({ ...dpo, name: e.target.value })}
                  placeholder={settings.data?.dpo_name ?? 'Nome do DPO'}
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-meta">E-mail</Label>
                <Input
                  value={dpo.email}
                  onChange={(e) => setDpo({ ...dpo, email: e.target.value })}
                  placeholder={settings.data?.dpo_email ?? 'dpo@empresa.com'}
                  className="bg-secondary/50 text-meta"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-meta">Telefone</Label>
                <Input
                  value={dpo.phone}
                  onChange={(e) => setDpo({ ...dpo, phone: e.target.value })}
                  placeholder={settings.data?.dpo_phone ?? '+55 11 90000-0000'}
                  className="bg-secondary/50 text-meta"
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => saveSettings.mutate()}
              disabled={!isAdmin || saveSettings.isPending || !workspaceId}
              className="gap-1"
            >
              {saveSettings.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
            {settings.error && <Failure error={settings.error} />}
            {settings.data && (
              <p className="text-meta text-muted-foreground">
                Consentimento explícito: {settings.data.require_explicit_consent ? 'exigido' : 'opcional'} · retenção
                padrão {settings.data.default_retention_days ?? '—'} dias · notificação ANPD em{' '}
                {settings.data.breach_notification_days ?? '—'} dia(s).
              </p>
            )}
            {!settings.data && !settings.isLoading && !settings.error && (
              <p className="text-meta text-muted-foreground">
                Nenhuma configuração gravada ainda para este workspace.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}