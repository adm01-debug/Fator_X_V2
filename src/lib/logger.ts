import type { DbRow } from '@/types/dbRow';
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, critical: 4,
};

const MIN_LEVEL: LogLevel = import.meta.env.PROD ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` | ${JSON.stringify(entry.context)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${ctx}`;
}

function normalizeContext(ctx: DbRow): Record<string, unknown> | undefined {
  if (ctx === undefined) return undefined;
  if (ctx instanceof Error) return { error: ctx.message, stack: ctx.stack };
  if (typeof ctx === 'object' && ctx !== null) return ctx as Record<string, unknown>;
  return { value: String(ctx) };
}

function log(level: LogLevel, message: string, context?: DbRow) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    context: normalizeContext(context),
    timestamp: new Date().toISOString(),
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'debug': console.debug(formatted); break;
    case 'info': console.info(formatted); break;
    case 'warn': console.warn(formatted); break;
    case 'error': console.error(formatted); break;
    case 'critical': console.error(`%c${formatted}`, 'color: white; background: red; font-weight: bold; padding: 2px;'); break;
  }

  // Forward errors to Sentry (no-op if not initialized)
  if (level === 'error' || level === 'critical') {
    // Lazy import to avoid circular dep at module init
    import('./sentry').then(({ captureException, isSentryEnabled }) => {
      if (!isSentryEnabled()) return;
      const err = entry.context?.stack
        ? new Error(`${message} :: ${entry.context.error ?? ''}`)
        : new Error(message);
      captureException(err, entry.context);
    }).catch(() => { /* noop */ });
  }
}

export const logger = {
  debug: (msg: string, ctx?: DbRow) => log('debug', msg, ctx),
  info: (msg: string, ctx?: DbRow) => log('info', msg, ctx),
  warn: (msg: string, ctx?: DbRow) => log('warn', msg, ctx),
  error: (msg: string, ctx?: DbRow) => log('error', msg, ctx),
  critical: (msg: string, ctx?: DbRow) => log('critical', msg, ctx),
};

/** Attach global error handlers — call once at app boot */
export function initGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled Promise rejection', {
      reason: String(event.reason),
      stack: event.reason?.stack?.split('\n').slice(0, 5).join('\n'),
    });
  });

  window.addEventListener('error', (event) => {
    logger.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
}
