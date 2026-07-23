import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, CheckCircle2, Shield, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { CardGridSkeleton } from '@/components/shared/PageSkeleton';
import { listSkills, type AgentSkillDefinition } from '@/services/skillsRegistryService';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'all', label: 'Todas' },
  { value: 'tools', label: 'Ferramentas' },
  { value: 'knowledge', label: 'Conhecimento' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'integrations', label: 'Integrações' },
];

const CATEGORY_COLORS: Record<string, string> = {
  tools: 'bg-nexus-cyan/10 text-nexus-cyan border-nexus-cyan/20',
  knowledge: 'bg-nexus-emerald/10 text-nexus-emerald border-nexus-emerald/20',
  prompts: 'bg-nexus-purple/10 text-nexus-purple border-nexus-purple/20',
  workflows: 'bg-nexus-amber/10 text-nexus-amber border-nexus-amber/20',
  integrations: 'bg-primary/10 text-primary border-primary/20',
};

interface SkillsPickerPanelProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  recommendedIds?: string[];
  emptyDescription?: string;
}

export function SkillsPickerPanel({
  selectedIds,
  onChange,
  recommendedIds = [],
  emptyDescription,
}: SkillsPickerPanelProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['skills_picker', search, category],
    queryFn: () =>
      listSkills({
        search: search || undefined,
        category: category === 'all' ? undefined : category,
        limit: 60,
      }),
    staleTime: 30_000,
  });

  const skills = useMemo(() => data?.skills ?? [], [data]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const recommendedSet = useMemo(() => new Set(recommendedIds), [recommendedIds]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter((s) => s !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col sm:flex-row gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-secondary/50"
              aria-label="Buscar skills"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="secondary" className="text-meta">
          {selectedIds.length} selecionada{selectedIds.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {isLoading ? (
        <CardGridSkeleton count={6} cols={2} />
      ) : skills.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhuma skill encontrada"
          description={emptyDescription ?? 'Ajuste a busca ou publique uma nova skill no composer.'}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {skills.map((skill) => (
            <PickerCard
              key={skill.id}
              skill={skill}
              selected={selectedSet.has(skill.id)}
              recommended={recommendedSet.has(skill.id)}
              onToggle={() => toggle(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PickerCardProps {
  skill: AgentSkillDefinition;
  selected: boolean;
  recommended: boolean;
  onToggle: () => void;
}

function PickerCard({ skill, selected, recommended, onToggle }: PickerCardProps) {
  const colorClass = CATEGORY_COLORS[skill.category] || 'bg-muted text-muted-foreground';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'text-left nexus-card flex flex-col gap-2 transition-all',
        selected
          ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
          : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-body-sm font-semibold text-foreground truncate">{skill.name}</h3>
            {skill.is_verified && <Shield className="h-3.5 w-3.5 text-nexus-emerald shrink-0" aria-label="Verificada" />}
            {recommended && (
              <Badge className="bg-nexus-amber/15 text-nexus-amber border-nexus-amber/30 text-meta">
                Recomendada ⚡
              </Badge>
            )}
          </div>
          <p className="text-meta text-muted-foreground line-clamp-2">{skill.description}</p>
        </div>
        {selected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-1">
        <Badge variant="outline" className={cn('text-meta', colorClass)}>
          {skill.category}
        </Badge>
        <span className="text-meta text-muted-foreground">v{skill.version}</span>
        <span className="flex items-center gap-1 text-meta text-muted-foreground ml-auto">
          <Download className="h-3 w-3" /> {skill.install_count}
        </span>
      </div>
    </button>
  );
}
