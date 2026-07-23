/**
 * Skill Composer — cria e publica uma skill customizada sem código.
 * Validação com Zod, sanitização com DOMPurify, publish com is_verified=false.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Rocket, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { InfoHint } from '@/components/shared/InfoHint';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { publishSkill, SKILL_CATEGORIES } from '@/services/skillsRegistryService';
import { stripHtml } from '@/lib/sanitize';
import { useAuth } from '@/contexts/AuthContext';

export const skillComposerSchema = z.object({
  name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80, 'Máximo 80 caracteres'),
  slug: z
    .string()
    .trim()
    .min(3, 'Mínimo 3 caracteres')
    .max(80, 'Máximo 80 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Apenas minúsculas, números e hífen'),
  description: z.string().trim().min(20, 'Mínimo 20 caracteres').max(500, 'Máximo 500 caracteres'),
  category: z.enum(['tools', 'knowledge', 'prompts', 'workflows', 'integrations']),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'Formato: X.Y.Z (ex: 1.0.0)'),
  tags: z.array(z.string().trim().min(1).max(24)).max(8, 'Máximo 8 tags'),
  configJson: z.string().refine((v) => {
    try { JSON.parse(v); return true; } catch { return false; }
  }, 'JSON inválido'),
});

export type SkillComposerInput = z.infer<typeof skillComposerSchema>;

export function slugify(name: string): string {
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

const CATEGORY_DEFAULT_CONFIG: Record<string, string> = {
  tools: JSON.stringify({ endpoint: 'https://api.example.com', method: 'POST', headers: {} }, null, 2),
  knowledge: JSON.stringify({ source: 'https://', chunk_size: 512 }, null, 2),
  prompts: JSON.stringify({ template: 'Você é um {{role}} especializado em {{domain}}.', variables: ['role', 'domain'] }, null, 2),
  workflows: JSON.stringify({ steps: [{ name: 'passo1', action: 'noop' }] }, null, 2),
  integrations: JSON.stringify({ provider: 'slack', event: 'message', auth: 'oauth2' }, null, 2),
};

export default function SkillComposerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [form, setForm] = useState<SkillComposerInput>({
    name: '',
    slug: '',
    description: '',
    category: 'tools',
    version: '1.0.0',
    tags: [],
    configJson: CATEGORY_DEFAULT_CONFIG.tools,
  });
  const [tagInput, setTagInput] = useState('');

  const update = <K extends keyof SkillComposerInput>(k: K, v: SkillComposerInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const validation = useMemo(() => {
    return skillComposerSchema.safeParse(form);
  }, [form]);

  const errors = useMemo(() => {
    if (validation.success) return {} as Partial<Record<keyof SkillComposerInput, string>>;
    const out: Partial<Record<keyof SkillComposerInput, string>> = {};
    for (const issue of validation.error.issues) {
      const key = issue.path[0] as keyof SkillComposerInput;
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  }, [validation]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || form.tags.includes(t) || form.tags.length >= 8) return;
    update('tags', [...form.tags, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => update('tags', form.tags.filter((x) => x !== t));

  const handleCategoryChange = (v: string) => {
    const cat = v as SkillComposerInput['category'];
    setForm((f) => ({
      ...f,
      category: cat,
      configJson: f.configJson.trim() === '' || Object.values(CATEGORY_DEFAULT_CONFIG).includes(f.configJson)
        ? CATEGORY_DEFAULT_CONFIG[cat]
        : f.configJson,
    }));
  };

  const handlePublish = async () => {
    const result = skillComposerSchema.safeParse(form);
    if (!result.success) {
      toast.error('Corrija os erros antes de publicar');
      return;
    }
    setPublishing(true);
    try {
      const configObj = JSON.parse(result.data.configJson) as Record<string, unknown>;
      await publishSkill({
        name: stripHtml(result.data.name),
        slug: result.data.slug,
        description: stripHtml(result.data.description),
        version: result.data.version,
        author: user?.email || 'anônimo',
        category: result.data.category,
        tags: result.data.tags.map((t) => stripHtml(t)),
        skill_config: configObj,
        is_public: true,
        is_verified: false,
      });
      toast.success('Skill publicada! Aguardando revisão para verificação.');
      navigate('/skills');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao publicar';
      toast.error(msg);
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

      <PageHeader
        title="Composer de Skills"
        description="Crie e publique skills customizadas sem escrever código"
      />

      <InfoHint title="Como funciona">
        Skills publicadas ficam com status <strong>não verificada</strong> até revisão. O JSON de
        configuração é validado no momento da publicação.
      </InfoHint>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-title-sm">Detalhes da skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="skill-name">Nome</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: f.slug === '' || f.slug === slugify(f.name) ? slugify(name) : f.slug,
                  }));
                }}
                placeholder="Buscador de Contatos CRM"
                maxLength={80}
              />
              {errors.name && <p className="text-meta text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-slug">Slug</Label>
              <Input
                id="skill-slug"
                value={form.slug}
                onChange={(e) => update('slug', slugify(e.target.value))}
                placeholder="buscador-contatos-crm"
                maxLength={80}
              />
              {errors.slug && <p className="text-meta text-destructive">{errors.slug}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-desc">Descrição</Label>
              <Textarea
                id="skill-desc"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Explique o que esta skill faz e quando usar..."
                rows={3}
                maxLength={500}
              />
              <p className="text-meta text-muted-foreground">{form.description.length}/500</p>
              {errors.description && <p className="text-meta text-destructive">{errors.description}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="skill-version">Versão</Label>
                <Input
                  id="skill-version"
                  value={form.version}
                  onChange={(e) => update('version', e.target.value)}
                  placeholder="1.0.0"
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                  }}
                  placeholder="pressione Enter para adicionar"
                  maxLength={24}
                />
                <Button type="button" variant="outline" onClick={addTag}>Adicionar</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => removeTag(t)}>
                      {t} ×
                    </Badge>
                  ))}
                </div>
              )}
              {errors.tags && <p className="text-meta text-destructive">{errors.tags}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="skill-config">Configuração (JSON)</Label>
              <Textarea
                id="skill-config"
                value={form.configJson}
                onChange={(e) => update('configJson', e.target.value)}
                rows={10}
                className="font-mono text-meta"
                spellCheck={false}
              />
              {errors.configJson && <p className="text-meta text-destructive">{errors.configJson}</p>}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handlePublish} disabled={!canPublish} className="gap-2">
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Publicar skill
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-title-sm">Prévia visual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="nexus-card flex flex-col gap-3">
                <h3 className="text-body-sm font-semibold">{form.name || 'Nome da skill'}</h3>
                <p className="text-meta text-muted-foreground line-clamp-3">
                  {form.description || 'Descrição aparecerá aqui...'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-meta">{form.category}</Badge>
                  <span className="text-meta text-muted-foreground">v{form.version}</span>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-border/50">
                    {form.tags.slice(0, 4).map((t) => (
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
            <CardHeader>
              <CardTitle className="text-title-sm">Preview JSON</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-meta font-mono bg-secondary/40 p-3 rounded-lg overflow-x-auto max-h-[300px]">
{form.configJson}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
