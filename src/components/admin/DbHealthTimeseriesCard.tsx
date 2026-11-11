/**
 * DbHealthTimeseriesCard — Fase 11
 * Série temporal (últimas 24h por padrão) de WAL, % de conexões
 * e mean_ms da consulta mais lenta. Admin-only via RPC.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LineChart, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface Sample {
  captured_at: string;
  wal_bytes: number;
  connections_pct: number;
  top_slow_mean_ms: number;
}

const RANGES: Array<{ label: string; hours: number }> = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

export function DbHealthTimeseriesCard() {
  const [hours, setHours] = useState<number>(24);

  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['db-health-timeseries', hours],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Sample[]> => {
      const { data, error } = await supabase.rpc(
        'get_db_health_timeseries' as never,
        { _hours: hours } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as Sample[];
    },
  });

  const chartData = data.map((s) => ({
    t: new Date(s.captured_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    wal_mb: Math.round((s.wal_bytes / (1024 * 1024)) * 10) / 10,
    conn_pct: Number(s.connections_pct),
    mean_ms: Math.round(Number(s.top_slow_mean_ms)),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-body">
            <TrendingUp className="h-4 w-4 text-nexus-primary" />
            Série temporal de saúde
          </CardTitle>
          <CardDescription>Amostras a cada 5 min. Retenção de 30 dias.</CardDescription>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.hours}
              size="sm"
              variant={r.hours === hours ? 'default' : 'outline'}
              onClick={() => setHours(r.hours)}
              className="h-7 px-2 text-meta"
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && <p className="text-body-sm text-muted-foreground">Carregando série…</p>}
        {error && (
          <p className="text-body-sm text-destructive">
            Sem permissão ou falha na leitura. Requer admin do workspace.
          </p>
        )}
        {!isLoading && !error && chartData.length === 0 && (
          <p className="text-body-sm text-muted-foreground flex items-center gap-2">
            <LineChart className="h-4 w-4" />
            Ainda sem amostras. Aguarde a próxima coleta (5 min).
          </p>
        )}
        {chartData.length > 0 && (
          <>
            <ChartBlock
              title="WAL (MB)"
              dataKey="wal_mb"
              data={chartData}
              color="hsl(var(--nexus-primary))"
            />
            <ChartBlock
              title="Conexões (%)"
              dataKey="conn_pct"
              data={chartData}
              color="hsl(var(--nexus-accent, 280 60% 60%))"
            />
            <ChartBlock
              title="Query mais lenta (ms)"
              dataKey="mean_ms"
              data={chartData}
              color="hsl(var(--destructive))"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChartBlock({
  title,
  dataKey,
  data,
  color,
}: {
  title: string;
  dataKey: string;
  data: Array<Record<string, string | number>>;
  color: string;
}) {
  return (
    <div>
      <h4 className="text-meta font-semibold text-muted-foreground mb-2">{title}</h4>
      <ResponsiveContainer width="100%" height={140}>
        <RLineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} labelStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
