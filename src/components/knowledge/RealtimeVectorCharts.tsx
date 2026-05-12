import { Card } from '@/components/ui/card';
import { 
  Zap, 
  Target, 
  BarChart3,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

const latencyData = [
  { time: '10:00', latency: 45 },
  { time: '10:05', latency: 52 },
  { time: '10:10', latency: 38 },
  { time: '10:15', latency: 65 },
  { time: '10:20', latency: 48 },
  { time: '10:25', latency: 42 },
  { time: '10:30', latency: 55 },
];

const scoreDistribution = [
  { range: '0.9-1.0', count: 45, color: 'hsl(var(--nexus-emerald))' },
  { range: '0.8-0.9', count: 32, color: 'hsl(var(--nexus-cyan))' },
  { range: '0.7-0.8', count: 18, color: 'hsl(var(--primary))' },
  { range: '< 0.7', count: 5, color: 'hsl(var(--muted-foreground))' },
];

export function RealtimeVectorCharts() {
  return (
    <Card className="p-5 bg-card/30 border-border/40 space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Vector Telemetry</h3>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-nexus-emerald/10 text-nexus-emerald text-[9px] font-black uppercase border border-nexus-emerald/20">
          <RefreshCw className="h-2.5 w-2.5 animate-spin-slow" /> Live
        </div>
      </div>

      <div className="space-y-6">
        {/* Retrieval Latency Area Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase">
              <Zap className="h-3 w-3 text-nexus-amber" />
              Retrieval Latency (ms)
            </div>
            <span className="text-xs font-black text-foreground">48ms avg</span>
          </div>
          <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData}>
                <defs>
                  <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.2)" />
                <XAxis 
                  dataKey="time" 
                  hide 
                />
                <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    fontSize: '10px',
                    borderRadius: '8px'
                  }}
                  itemStyle={{ color: 'hsl(var(--primary))' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="latency" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#latencyGradient)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Score Distribution Bar Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase">
              <Target className="h-3 w-3 text-nexus-emerald" />
              Score Distribution
            </div>
            <div className="flex items-center gap-1 text-nexus-emerald text-[10px] font-bold">
              94.2% <ArrowUpRight className="h-2.5 w-2.5" />
            </div>
          </div>
          <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.2)" />
                <XAxis 
                  dataKey="range" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis hide />
                <Tooltip 
                   cursor={{ fill: 'transparent' }}
                   contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    fontSize: '10px',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/10 space-y-1">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Success Rate</p>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black text-foreground">99.98%</span>
              <div className="h-1.5 w-1.5 rounded-full bg-nexus-emerald animate-pulse" />
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-secondary/20 border border-border/10 space-y-1">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Cache Hit</p>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-black text-foreground">84.5%</span>
              <span className="text-[8px] font-bold text-nexus-cyan">HNSW</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}