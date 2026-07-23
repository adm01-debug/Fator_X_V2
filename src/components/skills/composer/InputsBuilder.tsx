import { useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { Package } from 'lucide-react';
import type { SkillInput, SkillInputType } from '@/lib/skillComposer/skillDraft';
import { newId } from '@/lib/skillComposer/skillDraft';

interface InputsBuilderProps {
  inputs: SkillInput[];
  onChange: (inputs: SkillInput[]) => void;
}

const TYPE_LABELS: Record<SkillInputType, string> = {
  string: 'Texto',
  number: 'Número',
  boolean: 'Booleano',
  enum: 'Lista (enum)',
  json: 'JSON',
};

export function InputsBuilder({ inputs, onChange }: InputsBuilderProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addInput = () => {
    const next: SkillInput = {
      id: newId(),
      name: `param_${inputs.length + 1}`,
      type: 'string',
      required: true,
      description: '',
      defaultValue: '',
      validation: { pattern: '', enumValues: [] },
    };
    onChange([...inputs, next]);
    setExpandedId(next.id);
  };

  const updateInput = (id: string, patch: Partial<SkillInput>) => {
    onChange(inputs.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const updateValidation = (id: string, patch: Partial<SkillInput['validation']>) => {
    onChange(
      inputs.map((i) =>
        i.id === id ? { ...i, validation: { ...i.validation, ...patch } } : i,
      ),
    );
  };

  const removeInput = (id: string) => {
    onChange(inputs.filter((i) => i.id !== id));
  };

  const duplicateInput = (id: string) => {
    const src = inputs.find((i) => i.id === id);
    if (!src) return;
    onChange([...inputs, { ...src, id: newId(), name: `${src.name}_copia` }]);
  };

  if (inputs.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Package}
          title="Nenhum input configurado"
          description="Adicione parâmetros que o agente vai preencher ao invocar esta skill."
        />
        <div className="flex justify-center">
          <Button onClick={addInput} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar input
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-muted-foreground">
          {inputs.length} input{inputs.length === 1 ? '' : 's'} — clique para editar validações.
        </p>
        <Button size="sm" onClick={addInput} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Adicionar input
        </Button>
      </div>

      <ul className="space-y-2">
        {inputs.map((input) => {
          const isOpen = expandedId === input.id;
          return (
            <li
              key={input.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : input.id)}
                className="w-full flex items-center justify-between gap-3 p-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <code className="text-body-sm font-mono font-semibold text-foreground">
                    {input.name}
                  </code>
                  <Badge variant="outline" className="text-meta">
                    {TYPE_LABELS[input.type]}
                  </Badge>
                  {input.required && (
                    <Badge className="text-meta bg-destructive/10 text-destructive border-destructive/20">
                      obrigatório
                    </Badge>
                  )}
                  {input.description && (
                    <span className="text-meta text-muted-foreground truncate max-w-md">
                      {input.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Duplicar"
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-secondary text-muted-foreground"
                    onClick={(e) => { e.stopPropagation(); duplicateInput(input.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); duplicateInput(input.id);
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Remover"
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeInput(input.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); removeInput(input.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border p-4 space-y-4 bg-secondary/20">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Nome do parâmetro</Label>
                      <Input
                        value={input.name}
                        onChange={(e) => updateInput(input.id, { name: e.target.value })}
                        maxLength={40}
                        spellCheck={false}
                        className="font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select
                        value={input.type}
                        onValueChange={(v) => updateInput(input.id, { type: v as SkillInputType })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TYPE_LABELS) as SkillInputType[]).map((t) => (
                            <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Textarea
                      value={input.description}
                      onChange={(e) => updateInput(input.id, { description: e.target.value })}
                      rows={2}
                      maxLength={200}
                      placeholder="O que este parâmetro representa?"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Valor padrão</Label>
                      <Input
                        value={input.defaultValue ?? ''}
                        onChange={(e) => updateInput(input.id, { defaultValue: e.target.value })}
                        maxLength={200}
                        placeholder="(opcional)"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-6">
                      <Switch
                        id={`req-${input.id}`}
                        checked={input.required}
                        onCheckedChange={(v) => updateInput(input.id, { required: v })}
                      />
                      <Label htmlFor={`req-${input.id}`}>Obrigatório</Label>
                    </div>
                  </div>

                  {/* Validações */}
                  <div className="rounded-md border border-border p-3 space-y-3 bg-background">
                    <Label className="text-body-sm font-semibold">Validações</Label>

                    {(input.type === 'string' || input.type === 'number') && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-meta">
                            {input.type === 'number' ? 'Mínimo' : 'Tamanho mín.'}
                          </Label>
                          <Input
                            type="number"
                            value={input.validation.min ?? ''}
                            onChange={(e) => updateValidation(input.id, {
                              min: e.target.value === '' ? undefined : Number(e.target.value),
                            })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-meta">
                            {input.type === 'number' ? 'Máximo' : 'Tamanho máx.'}
                          </Label>
                          <Input
                            type="number"
                            value={input.validation.max ?? ''}
                            onChange={(e) => updateValidation(input.id, {
                              max: e.target.value === '' ? undefined : Number(e.target.value),
                            })}
                          />
                        </div>
                      </div>
                    )}

                    {input.type === 'string' && (
                      <div className="space-y-1.5">
                        <Label className="text-meta">Regex (opcional)</Label>
                        <Input
                          value={input.validation.pattern ?? ''}
                          onChange={(e) => updateValidation(input.id, { pattern: e.target.value })}
                          spellCheck={false}
                          className="font-mono"
                          placeholder="^[A-Z]{2,4}-\\d+$"
                        />
                      </div>
                    )}

                    {input.type === 'enum' && (
                      <EnumEditor
                        values={input.validation.enumValues}
                        onChange={(vals) => updateValidation(input.id, { enumValues: vals })}
                      />
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EnumEditor({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t || values.includes(t) || values.length >= 20) return;
    onChange([...values, t]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <Label className="text-meta">Valores possíveis</Label>
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder="Enter para adicionar"
          maxLength={40}
        />
        <Button type="button" variant="outline" onClick={add}>Adicionar</Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              {v} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
