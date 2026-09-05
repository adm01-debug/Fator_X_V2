import { Handle, Position } from 'reactflow';
import { cn } from '@/lib/utils';

interface NodeProps {
  data: { label?: string; [key: string]: unknown };
  selected?: boolean;
}

const nodeBase =
  'rounded-lg border bg-card px-4 py-2 shadow-nexus-sm min-w-[140px] text-center text-meta font-medium transition-all';

function makeNode(icon: string, label: string, color: string, hasIn: boolean, hasOut: boolean) {
  return function Node({ data, selected }: NodeProps) {
    return (
      <div className={cn(nodeBase, color, selected && 'ring-2 ring-primary')}>
        {hasIn && <Handle type="target" position={Position.Left} />}
        <div className="flex items-center justify-center gap-1.5">
          <span>{icon}</span>
          <span>{data.label || label}</span>
        </div>
        {hasOut && <Handle type="source" position={Position.Right} />}
      </div>
    );
  };
}

export const TriggerNode = makeNode(
  '▶️',
  'Trigger',
  'border-nexus-green/50 bg-nexus-green/10',
  false,
  true,
);
export const AgentNode = makeNode(
  '🤖',
  'Agent',
  'border-nexus-blue/50 bg-nexus-blue/10',
  true,
  true,
);
export const ToolNode = makeNode(
  '🔧',
  'Tool',
  'border-nexus-purple/50 bg-nexus-purple/10',
  true,
  true,
);
export const ConditionNode = makeNode(
  '🔀',
  'Condition',
  'border-nexus-yellow/50 bg-nexus-yellow/10',
  true,
  true,
);
export const TransformNode = makeNode(
  '✨',
  'Transform',
  'border-nexus-rose/50 bg-nexus-rose/10',
  true,
  true,
);
export const OutputNode = makeNode(
  '🎯',
  'Output',
  'border-nexus-red/50 bg-nexus-red/10',
  true,
  false,
);

export const nodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  tool: ToolNode,
  condition: ConditionNode,
  transform: TransformNode,
  output: OutputNode,
};

export const NODE_PALETTE = [
  { type: 'trigger', icon: '▶️', label: 'Trigger', desc: 'Entrada do fluxo' },
  { type: 'agent', icon: '🤖', label: 'Agente', desc: 'Chamada a um agente' },
  { type: 'tool', icon: '🔧', label: 'Ferramenta', desc: 'Execução de tool' },
  { type: 'condition', icon: '🔀', label: 'Condição', desc: 'Branch if/else' },
  { type: 'transform', icon: '✨', label: 'Transform', desc: 'Transforma dados' },
  { type: 'output', icon: '🎯', label: 'Output', desc: 'Saída final' },
];
