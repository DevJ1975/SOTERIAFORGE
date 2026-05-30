import {
  type EnvironmentProviders,
  ErrorHandler,
  Injectable,
  InjectionToken,
  type Provider,
  inject,
  isDevMode,
  makeEnvironmentProviders,
} from '@angular/core';

/**
 * Pluggable telemetry sink. Apps provide a real implementation (Sentry, GCP
 * Error Reporting, …) at deployment; the default logs to the console. App code
 * never depends on a concrete vendor.
 */
export interface TelemetrySink {
  captureError(error: unknown, context?: Record<string, unknown>): void;
  captureEvent(name: string, data?: Record<string, unknown>): void;
}

export const TELEMETRY_SINK = new InjectionToken<TelemetrySink>('TELEMETRY_SINK');

/** Default sink — structured console output; replaced in production. */
export class ConsoleTelemetrySink implements TelemetrySink {
  captureError(error: unknown, context?: Record<string, unknown>): void {
    console.error('[telemetry] error', error, context ?? {});
  }
  captureEvent(name: string, data?: Record<string, unknown>): void {
    if (isDevMode()) console.info('[telemetry] event', name, data ?? {});
  }
}

/** Routes uncaught Angular errors to the telemetry sink (and the console in dev). */
@Injectable()
export class ForgeErrorHandler implements ErrorHandler {
  private readonly sink = inject(TELEMETRY_SINK);

  handleError(error: unknown): void {
    this.sink.captureError(error);
    if (isDevMode()) console.error(error);
  }
}

/**
 * Wire observability: a global ErrorHandler forwarding to a TelemetrySink.
 * Pass a custom sink (Sentry/GCP) in production.
 */
export function provideObservability(sink?: Provider): EnvironmentProviders {
  return makeEnvironmentProviders([
    sink ?? { provide: TELEMETRY_SINK, useClass: ConsoleTelemetrySink },
    { provide: ErrorHandler, useClass: ForgeErrorHandler },
  ]);
}
