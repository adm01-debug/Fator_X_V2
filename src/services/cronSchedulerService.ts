/**
 * Nexus Agents Studio — Cron Scheduler Engine
 */

import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseExtended';
import { logger } from '@/lib/logger';

export type {
  ScheduleFrequency, ScheduleStatus, CronSchedule,
  CreateScheduleInput, ScheduleExecution, ScheduleStats,
  CronExecutorRunResult,
} from './types/cronSchedulerTypes';

import type {
  ScheduleStatus, CronSchedule, CreateScheduleInput,
  ScheduleExecution, ScheduleStats, CronExecutorRunResult,
} from './types/cronSchedulerTypes';

/* ── Cron Expression Parser ── */

interface CronParts { minute: number[]; hour: number[]; dayOfMonth: number[]; month: number[]; dayOfWeek: number[] }

function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];
  for (const part of field.split(',')) {
    if (part === '*') { for (let i = min; i <= max; i++) values.push(i); }
    else if (part.includes('/')) { const [range, stepStr] = part.split('/'); const step = parseInt(stepStr, 10); const start = range === '*' ? min : parseInt(range, 10); for (let i = start; i <= max; i += step) values.push(i); }
    else if (part.includes('-')) { const [s, e] = part.split('-'); for (let i = parseInt(s, 10); i <= parseInt(e, 10); i++) values.push(i); }
    else values.push(parseInt(part, 10));
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Parse a cron expression into its component parts.
 * @param expr - Standard 5-field cron expression (minute hour day month dow)
 */
export function parseCronExpression(expr: string): CronParts {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

/**
 * Calculate the next cron run time.
 * Handles timezone conversion: all calculations are done in the given timezone
 * (or UTC if none specified), returning a UTC Date.
 *
 * @param expr - Cron expression
 * @param after - Reference time (defaults to now)
 * @param timezone - IANA timezone for calculations (e.g. 'America/Sao_Paulo'). If omitted, uses UTC.
 */
export function getNextCronRun(
  expr: string,
  after: Date = new Date(),
  timezone?: string,
): Date {
  const cron = parseCronExpression(expr);

  // Compute offset: how many ms to add to a UTC instant to get local time.
  // offset > 0 means local is behind UTC (e.g. BRT = UTC-3 → offset = +3h)
  const offsetMs = timezone ? computeTzOffset(timezone, after) : 0;

  // Start from the next whole minute after `after`, in UTC.
  const startMs = after.getTime() + 60_000;
  const current = new Date(startMs);
  current.setUTCSeconds(0, 0);

  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    // Construct local datetime from the UTC instant for field comparison.
    // offsetMs = +3h for BRT → subtract to go "back" to BRT from UTC.
    // (UTC 10:30 − 3h = BRT 07:30)
    const local = new Date(current.getTime() - offsetMs);

    if (
      cron.month.includes(local.getUTCMonth() + 1) &&
      cron.dayOfMonth.includes(local.getUTCDate()) &&
      cron.dayOfWeek.includes(local.getUTCDay()) &&
      cron.hour.includes(local.getUTCHours()) &&
      cron.minute.includes(local.getUTCMinutes())
    ) {
      // current IS already the correct UTC instant — return as-is.
      return new Date(current.getTime());
    }
    current.setUTCMinutes(current.getUTCMinutes() + 1);
  }
  throw new Error('Could not find next cron run within 1 year');
}

/** Day-of-week (0=Sun) in the given timezone for a UTC instant. */
function _getLocalDayOfWeek(utcMs: number, tz: string): number {
  if (tz === 'America/Sao_Paulo') {
    const offset = getSaoPauloOffset(new Date(utcMs));
    return new Date(utcMs + offset).getUTCDay();
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dowMap[parts.weekday] ?? 0;
  } catch {
    return new Date(utcMs).getUTCDay();
  }
}

/** Returns the offset in ms to add to a UTC instant to get local time in the given timezone. */
function computeTzOffset(tz: string, instant: Date): number {
  if (tz === 'America/Sao_Paulo') {
    // BRT (standard): UTC-3 → offset = +3h; BRST (DST): UTC-2 → offset = +2h
    return getSaoPauloOffset(instant);
  }
  // Generic via Intl (works in browsers and Node — uses OS/ICU timezone database)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(instant).map(p => [p.type, p.value]));
    // new Date('YYYY-MM-DDTHH:MM:SS') interprets the argument as UTC — force UTC explicitly
    const localAsUtc = Date.UTC(
      parseInt(parts.year), parseInt(parts.month) - 1,
      parseInt(parts.day), parseInt(parts.hour),
      parseInt(parts.minute), parseInt(parts.second)
    );
    return instant.getTime() - localAsUtc;
  } catch {
    return 0;
  }
}

/** Brazil: BRT = UTC-3 (Apr–Oct), BRST = UTC-2 (Oct–Mar). */
function getSaoPauloOffset(date: Date): number {
  const month = date.getUTCMonth(); // 0-indexed
  const day = date.getUTCDate();

  if (month >= 10 || month <= 1) return 2 * 3600 * 1000; // BRST: UTC-2

  if (month === 2) {
    // DST ends on first Sunday of February → UTC-3 from that day onward
    const feb1 = Date.UTC(date.getUTCFullYear(), 1, 1);
    const dow = new Date(feb1).getUTCDay();
    const firstSun = feb1 + (7 - dow) % 7 * 86_400_000;
    return day >= new Date(firstSun).getUTCDate() ? 3 * 3600 * 1000 : 2 * 3600 * 1000;
  }

  if (month === 9) {
    // DST starts on second Sunday of October
    const oct1 = Date.UTC(date.getUTCFullYear(), 9, 1);
    const dow = new Date(oct1).getUTCDay();
    const secondSun = oct1 + ((7 - dow) % 7 + 7) * 86_400_000;
    return day >= new Date(secondSun).getUTCDate() ? 2 * 3600 * 1000 : 3 * 3600 * 1000;
  }

  return 3 * 3600 * 1000; // BRT: UTC-3 (Mar–Sep, excluding Oct boundary)
}

export function describeCronExpression(expr: string): string {
  const presets: Record<string, string> = { '* * * * *': 'Every minute', '*/5 * * * *': 'Every 5 minutes', '*/15 * * * *': 'Every 15 minutes', '*/30 * * * *': 'Every 30 minutes', '0 * * * *': 'Every hour', '0 */2 * * *': 'Every 2 hours', '0 */6 * * *': 'Every 6 hours', '0 0 * * *': 'Daily at midnight', '0 9 * * *': 'Daily at 9:00 AM', '0 9 * * 1-5': 'Weekdays at 9:00 AM', '0 0 * * 0': 'Weekly on Sunday', '0 0 * * 1': 'Weekly on Monday', '0 0 1 * *': 'Monthly on the 1st', '0 0 1 1 *': 'Yearly on Jan 1st' };
  return presets[expr] ?? `Custom: ${expr}`;
}

/* ── CRUD ── */

export async function createSchedule(input: CreateScheduleInput): Promise<CronSchedule> {
  let next_run_at: string | null = null;
  if (input.frequency === 'once' && input.start_at) next_run_at = input.start_at;
  else if (input.frequency === 'cron' && input.cron_expression) next_run_at = getNextCronRun(input.cron_expression).toISOString();
  else if (input.frequency === 'interval' && input.interval_seconds) { const n = new Date(); n.setSeconds(n.getSeconds() + input.interval_seconds); next_run_at = n.toISOString(); }
  else if (input.frequency === 'daily') next_run_at = getNextCronRun('0 0 * * *').toISOString();
  else if (input.frequency === 'weekly') next_run_at = getNextCronRun('0 0 * * 1').toISOString();
  else if (input.frequency === 'monthly') next_run_at = getNextCronRun('0 0 1 * *').toISOString();
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await fromTable('cron_schedules').insert({
    name: input.name, description: input.description ?? '', frequency: input.frequency,
    cron_expression: input.cron_expression ?? null, interval_seconds: input.interval_seconds ?? null,
    timezone: input.timezone ?? 'America/Sao_Paulo', next_run_at, status: 'active' as ScheduleStatus,
    target_type: input.target_type, target_id: input.target_id, target_config: input.target_config ?? {},
    retry_on_failure: input.retry_on_failure ?? true, max_retries: input.max_retries ?? 3,
    max_runs: input.max_runs ?? null, run_count: 0, created_by: userData?.user?.id ?? null,
  }).select().single();
  if (error) throw error;
  return data as CronSchedule;
}

export async function listSchedules(status?: ScheduleStatus): Promise<CronSchedule[]> {
  let query = fromTable('cron_schedules').select('*').order('next_run_at', { ascending: true });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as CronSchedule[];
}

export async function getSchedule(id: string): Promise<CronSchedule | null> {
  const { data, error } = await fromTable('cron_schedules').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as CronSchedule | null;
}

export async function updateSchedule(id: string, updates: Partial<CreateScheduleInput> & { status?: ScheduleStatus }): Promise<CronSchedule> {
  const patch: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  if (updates.cron_expression) patch.next_run_at = getNextCronRun(updates.cron_expression).toISOString();
  const { data, error } = await fromTable('cron_schedules').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as unknown as CronSchedule;
}

export async function pauseSchedule(id: string): Promise<CronSchedule> { return updateSchedule(id, { status: 'paused' }); }
export async function resumeSchedule(id: string): Promise<CronSchedule> { return updateSchedule(id, { status: 'active' }); }
export async function deleteSchedule(id: string): Promise<void> { const { error } = await fromTable('cron_schedules').delete().eq('id', id); if (error) throw error; }

/* ── Execution History ── */

export async function recordExecution(scheduleId: string, status: ScheduleExecution['status'], result?: Record<string, unknown>, errorMsg?: string, durationMs?: number, attempt?: number): Promise<ScheduleExecution> {
  const { data, error } = await fromTable('cron_schedule_executions').insert({ schedule_id: scheduleId, status, result: result ?? null, error: errorMsg ?? null, duration_ms: durationMs ?? null, attempt: attempt ?? 1, completed_at: status !== 'running' ? new Date().toISOString() : null }).select().single();
  if (error) throw error;
  if (status === 'success' || status === 'failed') {
    const schedule = await getSchedule(scheduleId);
    if (schedule) {
      const newRunCount = schedule.run_count + 1;
      const shouldComplete = schedule.max_runs !== null && newRunCount >= schedule.max_runs;
      const updatePayload: Record<string, unknown> = { run_count: newRunCount, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (shouldComplete) { updatePayload.status = 'completed'; updatePayload.next_run_at = null; }
      else if (schedule.cron_expression) updatePayload.next_run_at = getNextCronRun(schedule.cron_expression).toISOString();
      else if (schedule.interval_seconds) { const n = new Date(); n.setSeconds(n.getSeconds() + schedule.interval_seconds); updatePayload.next_run_at = n.toISOString(); }
      await fromTable('cron_schedules').update(updatePayload).eq('id', scheduleId);
    }
  }
  return data as ScheduleExecution;
}

export async function getScheduleExecutions(scheduleId: string, limit: number = 50): Promise<ScheduleExecution[]> {
  const { data, error } = await fromTable('cron_schedule_executions').select('*').eq('schedule_id', scheduleId).order('started_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ScheduleExecution[];
}

/* ── Stats ── */

export async function getScheduleStats(): Promise<ScheduleStats> {
  const allSchedules = await listSchedules();
  const active = allSchedules.filter((s) => s.status === 'active');
  const paused = allSchedules.filter((s) => s.status === 'paused');
  const { data: executions, error } = await fromTable('cron_schedule_executions').select('status, duration_ms').order('started_at', { ascending: false }).limit(1000);
  if (error) throw error;
  interface ExecRow { status: string; duration_ms: number | null }
  const execs = (executions ?? []) as ExecRow[];
  const successCount = execs.filter((e) => e.status === 'success').length;
  const durations = execs.map((e) => e.duration_ms).filter((d): d is number => d !== null);
  const upcoming = active.filter((s) => s.next_run_at !== null).sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime()).slice(0, 5);
  return { total_schedules: allSchedules.length, active_schedules: active.length, paused_schedules: paused.length, total_executions: execs.length, success_rate: execs.length > 0 ? (successCount / execs.length) * 100 : 0, avg_duration_ms: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0, next_upcoming: upcoming };
}


/* ── Presets & Edge Function ── */

export { CRON_PRESETS } from './presets/cronPresets';

export async function runCronExecutor(): Promise<CronExecutorRunResult> {
  const { data, error } = await supabase.functions.invoke('cron-executor', { body: { manual: true, source: 'frontend-panel' } });
  if (error) { logger.error('cron-executor invoke failed', { error: error.message }); throw new Error(error.message); }
  return (data as CronExecutorRunResult) ?? { ok: true };
}
