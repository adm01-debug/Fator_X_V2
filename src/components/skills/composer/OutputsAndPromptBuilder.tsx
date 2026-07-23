import { useRef } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import type { SkillOutput, SkillInputType } from '@/lib/skillComposer/skillDraft';
import { newId } from '@/lib/skillComposer/skillDraft';

const TYPE_LABELS: Record<SkillInputType, string> = {
  string: 'Texto', number: 'Número', boolean: 'Booleano', enum: 'Lista', json: 'JSON',
};

interface OutputsBuilderProps {
  outputs: SkillOutput[];
  onChange: (outputs: SkillOutput[]) => void;
}

export function OutputsBuilder({ outputs, onChange }: OutputsBuilderProps) {
  const addOutput = () => {
    onChange([
      ...outputs,
      { id: newId(), name: `resultado_${outputs.length + 1}`, type: 'string', description: '' },
    ]);
  };

  const update = (id: string, patch: Partial<SkillOutput>) => {
    onChange(outputs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const remove = (id: string) => {
    onChange(outputs.filter((o) => o.id !== id));
  };

  if (outputs.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Package}
          title="Nenhum output definido"
          description="Descreva o que a skill devolve ao agente para que ele use o resultado."
        />
        <div className="flex justify-center">
          <Button onClick={addOutput} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar output
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          {outputs.length} output{outputs.length === 1 ? '' : 's'} — a skill retornará estes campos.
        </p>
        <Button size="sm" onClick={addOutput} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Adicionar output
        </Button>
      </div>

      <ul className="space-y-2">
        {outputs.map((o) => (
          <li key={o.id} className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
              <div className="space-y-1.5">
                <Label className="text-meta">Nome</Label>
                <Input
                  value={o.name}
                  onChange={(e) => update(o.id, { name: e.target.value })}
                  maxLength={40}
                  className="font-mono"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-meta">Tipo</Label>
                <Select value={o.type} onValueChange={(v) => update(o.id, { type: v as SkillInputType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as SkillInputType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(o.id)}
                  className="text-destructive hover:bg-destructive/10 h-9 w-9"
                  aria-label="Remover output"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-meta">Descrição</Label>
              <Textarea
                value={o.description}
                onChange={(e) => update(o.id, { description: e.target.value })}
                rows={2}
                maxLength={200}
                placeholder="O que este campo representa?"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -------- Prompt Builder --------

interface PromptBuilderProps {
  systemMessage: string;
  template: string;
  onSystemChange: (v: string) => void;
  onTemplateChange: (v: string) => void;
  availableVariables: string[];
}

export function PromptBuilder({
  systemMessage,
  template,
  onSystemChange,
  onTemplateChange,
  availableVariables,
}: PromptBuilderProps) {
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varName: string) => {
    const el = templateRef.current;
    const insertion = `{{${varName}}}`;
    if (!el) {
      onTemplateChange(template + insertion);
      return;
    }
    const start = el.selectionStart ?? template.length;
    const end = el.selectionEnd ?? template.length;
    const next = template.slice(0, start) + insertion + template.slice(end);
    onTemplateChange(next);
    // Recoloca o cursor após a inserção
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="skill-system">Mensagem do sistema (opcional)</Label>
        <Textarea
          id="skill-system"
          value={systemMessage}
          onChange={(e) => onSystemChange(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Você é um assistente especialista em..."
        />
        <p className="text-meta text-muted-foreground">
          {systemMessage.length}/2000 — persona/instruções fixas para o modelo.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Label htmlFor="skill-template">Template do prompt</Label>
          {availableVariables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-meta text-muted-foreground">Inserir:</span>
              {availableVariables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:border-primary/40 transition-colors text-meta"
                  onClick={() => insertVariable(v)}
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Textarea
          id="skill-template"
          ref={templateRef}
          value={template}
          onChange={(e) => onTemplateChange(e.target.value)}
          rows={8}
          maxLength={4000}
          className="font-mono text-body-sm"
          placeholder={
            'Analise a mensagem abaixo do cliente {{cliente_nome}} e classifique como positiva, neutra ou negativa:\n\n{{mensagem}}\n\nResponda em JSON com { "sentimento": ..., "confianca": ... }.'
          }
        />
        <p className="text-meta text-muted-foreground">
          {template.length}/4000 — use <code>{'{{nome_do_input}}'}</code> para interpolar valores.
        </p>
      </div>

      {availableVariables.length === 0 && (
        <div className="text-meta text-muted-foreground rounded-lg border border-dashed border-border p-3">
          Adicione inputs na aba <strong>Inputs</strong> para poder inseri-los aqui como variáveis.
        </div>
      )}
    </div>
  );
}
