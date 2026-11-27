/**
 * Smoke test de pg_net sob demanda.
 *
 * A aba "pg_net" de System Jobs exibia apenas histórico e afirmava que o teste
 * "roda automaticamente" — mas a edge `pg-net-smoke-test` não era chamada por
 * nenhuma tela e nada gravava o resultado em `pg_net_smoke_runs`. Sem este
 * serviço, um erro de configuração em `pg_net` (que derruba os webhooks de
 * alerta) só aparecia quando o webhook já tinha falhado em produção.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PgNetSmokeResult {
  ok: boolean;
  request_id?: number | null;
  status_code?: number | null;
  latency_ms?: number | null;
  extension_schema?: string | null;
  phase?: string;
  error?: string;
}

export async function runPgNetSmokeTest(): Promise<PgNetSmokeResult> {
  const { data, error } = await supabase.functions.invoke('pg-net-smoke-test', {
    body: { url: 'https://postman-echo.com/post', timeout_ms: 8000 },
  });

  if (error) throw new Error(error.message || 'Falha ao executar o smoke test de pg_net');
  return (data ?? { ok: false }) as PgNetSmokeResult;
}