/**
 * TemplateRecommenderCard — recomendação automática de templates de agente
 * por departamento e por objetivo declarado pelo usuário.
 */
import { useMemo, useState } from 'react';
import { Sparkles, Rocket, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentTemplate } from '@/data/agentTemplates';
import { DEPARTMENTS, recommendTemplates } from '@/services/templateSkillRegistry';

const ALL_DEPARTMENTS = 'all';

export interface TemplateRecommenderCardProps {
  /** Acionado ao escolher um template recomendado. */
  onUseTemplate: (template: AgentTemplate) => void;
  /** Desabilita as ações enquanto uma criação está em andamento. */
  isBusy?: boolean;
}

export function TemplateRecommenderCard({ onUseTemplate, isBusy }: TemplateRecommenderCardProps) {
  const [objective, setObjective] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(ALL_DEPARTMENTS);

  const recommendations = useMemo(
    () =>
      recommendTemplates(
        {
          objective,
          departmentId: departmentId === ALL_DEPARTMENTS ? undefined : departmentId,
        },
        4,
      ),
    [objective, departmentId],
  );

  return (
    <Card className="border-nexus-amber/30 bg-gradient-to-br from-nexus-amber/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-nexus-amber" />
          <div>
            <CardTitle className="text-title-sm">Recomendação automática</CardTitle>
            <CardDescription className="text-meta">
              Descreva seu objetivo e escolha o departamento para receber os blueprints mais
              aderentes.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex.: reduzir ruptura de estoque e organizar a expedição"
              className="pl-9 bg-secondary/50"
              aria-label="Objetivo do agente"
            />
          </div>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger
              className="w-full sm:w-[260px] bg-secondary/50"
              aria-label="Departamento"
            >
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DEPARTMENTS}>Todos os departamentos</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.icon} {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {recommendations.length === 0 ? (
          <p className="text-meta text-muted-foreground">
            Informe um objetivo ou selecione um departamento para ver sugestões.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recommendations.map((rec) => (
              <li
                key={rec.skill.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-title-sm leading-none">
                    {rec.template.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium truncate">{rec.template.name}</p>
                    <p className="text-meta text-muted-foreground line-clamp-2">
                      {rec.template.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-meta">
                    {rec.template.category}
                  </Badge>
                  {rec.score > 0 && (
                    <Badge variant="outline" className="text-meta">
                      {Math.round(rec.score * 100)}% de aderência
                    </Badge>
                  )}
                </div>
                <p className="text-meta text-muted-foreground">{rec.reason}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 mt-auto"
                  disabled={isBusy}
                  onClick={() => onUseTemplate(rec.template)}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Usar este blueprint
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
