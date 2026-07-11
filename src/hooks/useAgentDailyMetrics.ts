import { useQuery } from '@tanstack/react-query';
import {
  fetchAgentDailyMetrics,
  type AgentDailyMetricWithName,
  type FetchDailyMetricsOptions,
} from '@/services/agentDailyMetricsService';

export function useAgentDailyMetrics(opts: FetchDailyMetricsOptions = {}) {
  return useQuery<AgentDailyMetricWithName[]>({
    queryKey: ['agent-daily-metrics', opts.days ?? 30, opts.agentId ?? 'all'],
    queryFn: () => fetchAgentDailyMetrics(opts),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
