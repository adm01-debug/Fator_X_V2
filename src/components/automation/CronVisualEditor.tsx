import { useState, useEffect } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeCronExpression } from '@/services/cronSchedulerService';

interface CronVisualEditorProps {
  value: string;
  onChange: (expression: string) => void;
}

export function CronVisualEditor({ value, onChange }: CronVisualEditorProps) {
  const [parts, setParts] = useState(value.split(/\s+/));

  useEffect(() => {
    setParts(value.split(/\s+/));
  }, [value]);

  const updatePart = (index: number, newVal: string) => {
    const newParts = [...parts];
    newParts[index] = newVal || '*';
    const newExpr = newParts.join(' ');
    onChange(newExpr);
  };

  return (
    <div className="space-y-4 p-4 bg-muted/20 rounded-xl border border-border/40">
      <div className="grid grid-cols-5 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Minuto</Label>
          <Input 
            value={parts[0] || '*'} 
            onChange={(e) => updatePart(0, e.target.value)} 
            className="h-8 text-xs font-mono"
            placeholder="0-59"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Hora</Label>
          <Input 
            value={parts[1] || '*'} 
            onChange={(e) => updatePart(1, e.target.value)} 
            className="h-8 text-xs font-mono"
            placeholder="0-23"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Dia</Label>
          <Input 
            value={parts[2] || '*'} 
            onChange={(e) => updatePart(2, e.target.value)} 
            className="h-8 text-xs font-mono"
            placeholder="1-31"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Mês</Label>
          <Input 
            value={parts[3] || '*'} 
            onChange={(e) => updatePart(3, e.target.value)} 
            className="h-8 text-xs font-mono"
            placeholder="1-12"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Semana</Label>
          <Input 
            value={parts[4] || '*'} 
            onChange={(e) => updatePart(4, e.target.value)} 
            className="h-8 text-xs font-mono"
            placeholder="0-6"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/20">
        <div className="space-y-0.5">
          <p className="text-[10px] font-black uppercase text-primary tracking-widest">Expressão Cron</p>
          <code className="text-xs font-mono text-foreground">{value}</code>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Descrição</p>
          <p className="text-xs font-medium text-foreground">{describeCronExpression(value)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
         <Button 
           variant="ghost" 
           size="sm" 
           className="h-7 text-[10px] font-bold uppercase border border-border/20"
           onClick={() => onChange('* * * * *')}
         >
           Reset para *
         </Button>
         <Button 
           variant="ghost" 
           size="sm" 
           className="h-7 text-[10px] font-bold uppercase border border-border/20"
           onClick={() => onChange('0 0 * * *')}
         >
           Meia-noite
         </Button>
      </div>
    </div>
  );
}

// Internal Button component since it's not exported from @/components/ui/button in this context
function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`inline-flex items-center justify-center rounded-md px-3 py-1 transition-colors hover:bg-accent ${className}`} {...props} />;
}
