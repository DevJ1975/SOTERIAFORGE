/**
 * Structured logging for Cloud Functions.
 *
 * Emits a single line of JSON to stdout/stderr per event. Cloud Logging parses
 * the line into `jsonPayload`, lifting `severity` and `message` into the log
 * entry and exposing every other field as a structured label you can filter on
 * (e.g. `jsonPayload.function`, `jsonPayload.actorUid`). This replaces the bare
 * `console.error(msg, obj)` calls, which Cloud Logging records as opaque text.
 *
 * Kept dependency-free (no firebase-functions/logger) so the cores can import it
 * without pulling the functions runtime into unit tests.
 */

export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

/** Structured labels attached to a log line. `undefined` values are dropped. */
export interface LogLabels {
  /** The function/trigger that emitted the log. */
  function?: string;
  /** The acting user, when known. */
  actorUid?: string;
  /** Tenant scope, when applicable. */
  tenantId?: string;
  /** Coarse result classification, e.g. 'ok' | 'denied' | 'error' | 'ignored'. */
  outcome?: string;
  /** Wall-clock duration of the operation, when measured. */
  latencyMs?: number;
  /** Any further non-sensitive structured context. */
  [key: string]: unknown;
}

function clean(labels: LogLabels): Record<string, unknown> {
  return Object.fromEntries(Object.entries(labels).filter(([, v]) => v !== undefined));
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(severity: Severity, message: string, labels: LogLabels = {}): void {
  const entry = { severity, message, ...clean(labels) };
  // ERROR/WARNING to stderr so they surface as error-level entries even without
  // the parsed severity; INFO/DEBUG to stdout.
  const line = JSON.stringify(entry, (_k, v) => serialize(v));
  if (severity === 'ERROR' || severity === 'WARNING') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug(message: string, labels?: LogLabels): void {
    emit('DEBUG', message, labels);
  },
  info(message: string, labels?: LogLabels): void {
    emit('INFO', message, labels);
  },
  warn(message: string, labels?: LogLabels): void {
    emit('WARNING', message, labels);
  },
  error(message: string, labels?: LogLabels): void {
    emit('ERROR', message, labels);
  },
};
