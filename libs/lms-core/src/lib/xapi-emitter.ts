import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { Statement } from '@forge/standards';

/**
 * Fire-and-forget client for the `recordStatements` Cloud Function (the
 * Soteria FORGE LRS ingest). Learning-record telemetry must never disturb the
 * learning flow, so this emitter:
 *
 * - injects `Functions` optionally (same pattern as ForgeAdminApi in
 *   @forge/auth) and silently no-ops with a console.debug when Firebase
 *   providers are absent (tests, storybook, partial app configs);
 * - never throws and never surfaces the returned promise — failures are
 *   swallowed with a console.debug.
 */
@Injectable({ providedIn: 'root' })
export class ForgeXapiEmitter {
  private readonly functions = inject(Functions, { optional: true });

  /** Batch-send statements to the LRS store. Fire-and-forget; never throws. */
  emit(statements: Statement[]): void {
    if (statements.length === 0) {
      return;
    }
    if (!this.functions) {
      console.debug('[xapi] Functions unavailable — dropping', statements.length, 'statement(s)');
      return;
    }
    try {
      httpsCallable<{ statements: Statement[] }, { tenantId: string; written: number }>(
        this.functions,
        'recordStatements',
      )({ statements }).catch((err) => {
        console.debug('[xapi] recordStatements failed', err);
      });
    } catch (err) {
      console.debug('[xapi] recordStatements failed', err);
    }
  }
}
