import { useMemo } from 'react';
import { useAgentBuilderStore } from '@/stores/agentBuilderStore';
import { SectionTitle, InputField, TextAreaField, SelectionGrid, SliderField } from '../ui';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { Sparkles, Info, CheckCircle2 } from 'lucide-react';
import type { AgentPersona } from '@/types/agentTypes';

const AVATAR_EMOJIS = [
  '🤖', '⚡', '🧠', '🎯', '🛡️', '🔮', '🦾', '🚀', '💎', '🌟',
  '🔥', '🧬', '🎨', '📊', '🔍', '🦅', '🐉', '🌐', '👁️', '⚙️',
];

const PERSONA_ITEMS = [
  { id: 'assistant' as AgentPersona, icon: '🤖', title: 'Assistente', description: 'Responde perguntas e executa tarefas sob demanda' },
  { id: 'specialist' as AgentPersona, icon: '🎓', title: 'Especialista', description: 'Domínio profundo em área específica' },
  { id: 'coordinator' as AgentPersona, icon: '🎯', title: 'Coordenador', description: 'Orquestra outros agentes e workflows' },
  { id: 'analyst' as AgentPersona, icon: '📊', title: 'Analista', description: 'Processa dados, gera insights e relatórios' },
  { id: 'creative' as AgentPersona, icon: '🎨', title: 'Criativo', description: 'Gera conteúdo, copy, design, ideias' },
  { id: 'autonomous' as AgentPersona, icon: '⚡', title: 'Autônomo', description: 'Opera proativamente com mínima supervisão' },
];

export function IdentityModule() {
  const agent = useAgentBuilderStore((s) => s.agent);
  const updateAgent = useAgentBuilderStore((s) => s.updateAgent);

  const radarData = useMemo(() => [
    { subject: 'Formalidade', A: agent.formality, fullMark: 100 },
    { subject: 'Proatividade', A: agent.proactivity, fullMark: 100 },
    { subject: 'Criatividade', A: agent.creativity, fullMark: 100 },
    { subject: 'Verbosidade', A: agent.verbosity, fullMark: 100 },
  ], [agent.formality, agent.proactivity, agent.creativity, agent.verbosity]);

  const personaPreview = useMemo(() => {
    let msg = "Olá! ";
    if (agent.formality > 70) msg = "Saudações. ";
    else if (agent.formality < 30) msg = "E aí! ";

    if (agent.creativity > 70) msg += "Estou pronto para cocriar algo incrível hoje. ";
    else msg += "Como posso auxiliar em suas tarefas atuais? ";

    if (agent.verbosity > 70) {
      msg += "Analisei os parâmetros da nossa interação e estou à disposição para aprofundar qualquer tópico que você julgar necessário para o sucesso da nossa missão.";
    } else if (agent.verbosity < 30) {
      msg += "Pronto.";
    } else {
      msg += "Estou à disposição.";
    }

    return msg;
  }, [agent.formality, agent.creativity, agent.verbosity]);

  return (
    <div className="space-y-8">
      {/* Seção A — Nome, Missão & Avatar */}
      <section>
        <SectionTitle icon="🧬" title="Nome, Missão & Avatar" subtitle="Defina a identidade fundamental do seu agente" />
        <div className="space-y-4">
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-primary uppercase">Sugestão de Preenchimento</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                Utilize o <strong>IA Builder</strong> no cabeçalho para gerar nome, missão e prompt a partir de uma ideia simples.
              </p>
            </div>
          </div>
          <InputField
            label="Nome do Agente"
            value={agent.name}
            onChange={(v) => updateAgent({ name: v })}
            placeholder="ARIA, Sentinela, Atlas..."
            hint="Escolha um nome memorável que represente a função do agente"
          />
          <InputField
            label="Missão"
            value={agent.mission}
            onChange={(v) => updateAgent({ mission: v })}
            placeholder="Automatizar o processo comercial..."
            hint="Uma frase clara que define o propósito principal"
          />
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">Avatar</span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => updateAgent({ avatar_emoji: emoji })}
                  className={cn(
                    'w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all duration-200 border',
                    agent.avatar_emoji === emoji
                      ? 'border-primary bg-primary/10 scale-110 shadow-[0_0_12px_hsl(var(--primary)/0.3)]'
                      : 'border-border bg-muted/30 hover:bg-muted/60 hover:scale-105'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seção B — Arquétipo / Persona */}
      <section>
        <SectionTitle icon="🎭" title="Arquétipo / Persona" subtitle="Selecione o papel principal do agente" />
        <SelectionGrid
          items={PERSONA_ITEMS}
          value={agent.persona}
          onChange={(v) => updateAgent({ persona: v as AgentPersona })}
          columns={3}
        />
      </section>

      {/* Seção C — Personalidade */}
      <section>
        <SectionTitle icon="🎚️" title="Personalidade" subtitle="Ajuste o comportamento e tom do agente" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <SliderField
              label="Formalidade"
              value={agent.formality}
              onChange={(v) => updateAgent({ formality: v })}
              min={0} max={100}
              description="0 = Casual → 100 = Muito formal"
            />
            <SliderField
              label="Proatividade"
              value={agent.proactivity}
              onChange={(v) => updateAgent({ proactivity: v })}
              min={0} max={100}
              description="0 = Reativo → 100 = Muito proativo"
            />
            <SliderField
              label="Criatividade"
              value={agent.creativity}
              onChange={(v) => updateAgent({ creativity: v })}
              min={0} max={100}
              description="0 = Conservador → 100 = Muito criativo"
            />
            <SliderField
              label="Verbosidade"
              value={agent.verbosity}
              onChange={(v) => updateAgent({ verbosity: v })}
              min={0} max={100}
              description="0 = Conciso → 100 = Detalhado"
            />
          </div>

          <div className="relative h-[300px] w-full flex flex-col items-center justify-center bg-muted/20 rounded-2xl border border-border overflow-hidden p-4">
            <div className="absolute top-4 left-4 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              <Sparkles className="h-3 w-3" /> Digital DNA
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Radar
                  name="DNA"
                  dataKey="A"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Persona Preview Box */}
        <div className="mt-6">
          <Card className="bg-primary/5 border-primary/20 p-4 relative overflow-hidden group hover:bg-primary/10 transition-colors">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Info className="h-12 w-12" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-none text-[10px] px-1.5 py-0">
                PREVIEW DA VOZ
              </Badge>
              <span className="text-[10px] text-muted-foreground italic">
                Baseado nos ajustes de personalidade acima
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed italic">
              "{personaPreview}"
            </p>
          </Card>
        </div>
      </section>

      {/* Seção D — Escopo & Validação */}
      <section>
        <SectionTitle icon="📐" title="Escopo de Atuação" subtitle="Defina os limites do que o agente pode e não pode fazer" />
        <div className="space-y-4">
          <TextAreaField
            label="Escopo"
            value={agent.scope}
            onChange={(v) => updateAgent({ scope: v })}
            placeholder={"O agente PODE:\n- Responder dúvidas sobre produtos\n- Consultar estoque\n\nO agente NÃO PODE:\n- Alterar preços\n- Aprovar descontos acima de 10%"}
            rows={6}
            hint="Defina limites claros. O que pode e NÃO pode fazer."
            maxLength={2000}
          />
          
          <div className="p-4 rounded-xl border border-nexus-emerald/20 bg-nexus-emerald/5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-nexus-emerald" />
              <h4 className="text-xs font-bold text-foreground uppercase tracking-tight">Validação de Identidade</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-[11px]">
                <div className={cn("h-1.5 w-1.5 rounded-full", agent.name ? "bg-nexus-emerald" : "bg-muted")} />
                <span className={cn(agent.name ? "text-foreground" : "text-muted-foreground")}>Nome configurado</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className={cn("h-1.5 w-1.5 rounded-full", agent.mission ? "bg-nexus-emerald" : "bg-muted")} />
                <span className={cn(agent.mission ? "text-foreground" : "text-muted-foreground")}>Missão definida</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className={cn("h-1.5 w-1.5 rounded-full", agent.scope.length > 50 ? "bg-nexus-emerald" : "bg-muted")} />
                <span className={cn(agent.scope.length > 50 ? "text-foreground" : "text-muted-foreground")}>Escopo detalhado</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <div className={cn("h-1.5 w-1.5 rounded-full", agent.avatar_emoji ? "bg-nexus-emerald" : "bg-muted")} />
                <span className={cn(agent.avatar_emoji ? "text-foreground" : "text-muted-foreground")}>Avatar selecionado</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
