/**
 * Skill Composer — construção visual de skills customizadas sem código.
 * Abas: Identidade, Inputs, Prompt, Execução, Outputs. JSON é gerado automaticamente.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Rocket, Loader2, User, Zap, MessageSquare, Cog, LogOut, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { InfoHint } from '@/components/shared/InfoHint';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { publishSkill, SKILL_CATEGORIES } from '@/services/skillsRegistryService';
import { stripHtml } from '@/lib/sanitize';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEFAULT_DRAFT,
  skillDraftSchema,
  draftToSkillConfig,
  CATEGORY_TO_EXECUTION_KIND,
  type SkillDraft,
} from '@/lib/skillComposer/skillDraft';
import { InputsBuilder } from '@/components/skills/composer/InputsBuilder';
import { OutputsBuilder, PromptBuilder } from '@/components/skills/composer/OutputsAndPromptBuilder';
import { ExecutionBuilder } from '@/components/skills/composer/ExecutionBuilder';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

const TAB_ICONS = {
  identity: User,
  inputs: Zap,
  prompt: MessageSquare,
  execution: Cog,
  outputs: LogOut,
  preview: Eye,
} as const;

export default function SkillComposerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState<'identity' | 'inputs' | 'prompt' | 'execution' | 'outputs' | 'preview'>('identity');
  const [draft, setDraft] = useState<SkillDraft>(DEFAULT_DRAFT);
  const [tagInput, setTagInput] = useState('');

  const patch = (p: Partial<SkillDraft>) => setDraft((d) => ({ ...d, ...p }));

  const validation = useMemo(() => skillDraftSchema.safeParse(draft), [draft]);

  const errors = useMemo(() => {
    if (validation.success) return {} as Partial<Record<keyof SkillDraft, string>>;
    const out: Partial<Record<keyof SkillDraft, string>> = {};
    for (const issue of validation.error.issues) {
      const key = issue.path[0] as keyof SkillDraft;
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  }, [validation]);

  const skillConfigPreview = useMemo(() => draftToSkillConfig(draft), [draft]);

  const availableVariables = useMemo(
    () => draft.inputs.map((i) => i.name).filter((n) => /^[a-z][a-z0-9_]*$/i.test(n)),
    [draft.inputs],
  );

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || draft.tags.includes(t) || draft.tags.length >= 8) return;
    patch({ tags: [...draft.tags, t] });
    setTagInput('');
  };

  const removeTag = (t: string) =>
    patch({ tags: draft.tags.filter((x) => x !== t) });

  const handleCategoryChange = (v: string) => {
    const cat = v as SkillDraft['category'];
    setDraft((d) => ({
      ...d,
      category: cat,
      execution: { ...d.execution, kind: CATEGORY_TO_EXECUTION_KIND[cat] },
    }));
  };

  const handlePublish = async () => {
    const result = skillDraftSchema.safeParse(draft);
    if (!result.success) {
      toast.error('Corrija os erros antes de publicar', {
        description: result.error.issues[0]?.message,
      });
      return;
    }
    setPublishing(true);
    try {
      await publishSkill({
        name: stripHtml(result.data.name),
        slug: result.data.slug,
        description: stripHtml(result.data.description),
        version: result.data.version,
        author: user?.email || 'anônimo',
        category: result.data.category,
        tags: result.data.tags.map((t) => stripHtml(t)),
        skill_config: draftToSkillConfig(result.data) as Record<string, unknown> & { [k: string]: string | number | boolean | null },
        is_public: true,
        is_verified: false,
      });
      toast.success('Skill publicada! Aguardando revisão.');
      navigate('/skills');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao publicar';
      toast.error('Erro ao publicar', { description: msg });
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = validation.success && !publishing;

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-6 max-w-[1400px] mx-auto animate-page-enter">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/skills')} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar ao marketplace
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Composer visual de Skills"
          description="Monte inputs, prompts, execução e outputs sem escrever uma linha de código"
        />
        <Button onClick={handlePublish} disabled={!canPublish} size="lg" className="gap-2">
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Publicar skill
        </Button>
      </div>

      <InfoHint title="Como funciona">
        Cada aba constrói uma parte da skill. O JSON de configuração é gerado automaticamente
        e pode ser inspecionado na aba <strong>Prévia</strong>. Skills publicadas ficam com status
        <em> não verificada </em>até revisão.
      </InfoHint>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto w-full mb-6">
                {(Object.keys(TAB_ICONS) as Array<keyof typeof TAB_ICONS>).map((k) => {
                  const Icon = TAB_ICONS[k];
                  const label = {
                    identity: 'Identidade',
                    inputs: 'Inputs',
                    prompt: 'Prompt',
                    execution: 'Execução',
                    outputs: 'Outputs',
                    preview: 'Prévia',
                  }[k];
                  return (
                    <TabsTrigger key={k} value={k} className="gap-1.5 py-2 text-meta">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* IDENTIDADE */}
              <TabsContent value="identity" className="space-y-4 mt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="skill-name">Nome</Label>
                  <Input
                    id="skill-name"
                    value={draft.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setDraft((d) => ({
                        ...d,
                        name,
                        slug: d.slug === '' || d.slug === slugify(d.name) ? slugify(name) : d.slug,
                      }));
                    }}
                    maxLength={80}
                    placeholder="Buscador de Contatos CRM"
                  />
                  {errors.name && <p className="text-meta text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="skill-slug">Slug</Label>
                  <Input
                    id="skill-slug"
                    value={draft.slug}
                    onChange={(e) => patch({ slug: slugify(e.target.value) })}
                    placeholder="buscador-contatos-crm"
                    maxLength={80}
                    className="font-mono"
                  />
                  {errors.slug && <p className="text-meta text-destructive">{errors.slug}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="skill-desc">Descrição</Label>
                  <Textarea
                    id="skill-desc"
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={3}
                    maxLength={500}
                    placeholder="Explique o que esta skill faz e quando o agente deve usá-la..."
                  />
                  <p className="text-meta text-muted-foreground">{draft.description.length}/500</p>
                  {errors.description && <p className="text-meta text-destructive">{errors.description}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Select value={draft.category} onValueChange={handleCategoryChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SKILL_CATEGORIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-meta text-muted-foreground">
                      Ajusta o modo de execução padrão.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-version">Versão</Label>
                    <Input
                      id="skill-version"
                      value={draft.version}
                      onChange={(e) => patch({ version: e.target.value })}
                      placeholder="1.0.0"
                      className="font-mono"
                    />
                    {errors.version && <p className="text-meta text-destructive">{errors.version}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      placeholder="Enter para adicionar"
                      maxLength={24}
                    />
                    <Button type="button" variant="outline" onClick={addTag}>Adicionar</Button>
                  </div>
                  {draft.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {draft.tags.map((t) => (
                        <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => removeTag(t)}>
                          {t} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* INPUTS */}
              <TabsContent value="inputs" className="mt-0">
                <InputsBuilder
                  inputs={draft.inputs}
                  onChange={(inputs) => patch({ inputs })}
                />
              </TabsContent>

              {/* PROMPT */}
              <TabsContent value="prompt" className="mt-0">
                <PromptBuilder
                  systemMessage={draft.prompt.systemMessage}
                  template={draft.prompt.template}
                  onSystemChange={(v) => patch({ prompt: { ...draft.prompt, systemMessage: v } })}
                  onTemplateChange={(v) => patch({ prompt: { ...draft.prompt, template: v } })}
                  availableVariables={availableVariables}
                />
              </TabsContent>

              {/* EXECUÇÃO */}
              <TabsContent value="execution" className="mt-0">
                <ExecutionBuilder
                  execution={draft.execution}
                  onChange={(execution) => patch({ execution })}
                />
              </TabsContent>

              {/* OUTPUTS */}
              <TabsContent value="outputs" className="mt-0">
                <OutputsBuilder
                  outputs={draft.outputs}
                  onChange={(outputs) => patch({ outputs })}
                />
              </TabsContent>

              {/* PRÉVIA */}
              <TabsContent value="preview" className="mt-0 space-y-4">
                <div>
                  <Label className="text-body-sm font-semibold">JSON gerado (skill_config)</Label>
                  <p className="text-meta text-muted-foreground mb-2">
                    Este é o payload que será persistido no registry. Você não precisa editá-lo.
                  </p>
                  <pre className="text-meta font-mono bg-secondary/40 p-4 rounded-lg overflow-x-auto max-h-[500px] border border-border">
{JSON.stringify(skillConfigPreview, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Prévia lateral */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-title-sm">Prévia do card</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="nexus-card flex flex-col gap-3">
                <h3 className="text-body-sm font-semibold">{draft.name || 'Nome da skill'}</h3>
                <p className="text-meta text-muted-foreground line-clamp-3">
                  {draft.description || 'Descrição aparecerá aqui…'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-meta">{draft.category}</Badge>
                  <span className="text-meta text-muted-foreground">v{draft.version}</span>
                </div>
                {draft.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
                    {draft.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-meta px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-title-sm">Status do rascunho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-body-sm">
              <StatusRow label="Identidade" ok={!errors.name && !errors.slug && !errors.description && !errors.version} />
              <StatusRow label="Inputs" ok={draft.inputs.length > 0} count={draft.inputs.length} optional />
              <StatusRow label="Prompt" ok={draft.prompt.template.length > 0} optional />
              <StatusRow label="Execução" ok configured={draft.execution.kind} />
              <StatusRow label="Outputs" ok={draft.outputs.length > 0} count={draft.outputs.length} optional />
              <div className="pt-2 border-t border-border/50">
                {validation.success ? (
                  <p className="text-meta text-nexus-emerald">✓ Pronto para publicar</p>
                ) : (
                  <p className="text-meta text-destructive">
                    Corrija os campos obrigatórios da aba <strong>Identidade</strong> para publicar.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface StatusRowProps {
  label: string;
  ok: boolean;
  count?: number;
  optional?: boolean;
  configured?: string;
}

function StatusRow({ label, ok, count, optional, configured }: StatusRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-body-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {configured && (
          <Badge variant="outline" className="text-meta font-mono">{configured}</Badge>
        )}
        {typeof count === 'number' && (
          <Badge variant="secondary" className="text-meta">{count}</Badge>
        )}
        <span className={`text-meta ${ok ? 'text-nexus-emerald' : optional ? 'text-muted-foreground' : 'text-destructive'}`}>
          {ok ? '✓' : optional ? '—' : '!'}
        </span>
      </div>
    </div>
  );
}
