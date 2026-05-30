import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { XapiStatement, XAPI_TENANT_EXTENSION } from '@assurance/shared';
import { getVerb, FriendlyVerbName } from './verbs';
import { OfflineXapiQueue } from './offline-xapi-queue.service';

/**
 * Options for constructing an xAPI statement.
 */
export interface BuildStatementOpts {
  /** Firebase UID of the actor. */
  uid: string;
  /** Display name of the actor (optional). */
  actorName?: string;
  /** Home page URL for the actor account (identifies the LRS/platform). */
  homePage: string;
  /** Friendly verb name from VERB_MAP. */
  verb: FriendlyVerbName;
  /** Activity IRI identifying the learning object. */
  activityId: string;
  /** Tenant id — stamped into context.extensions[XAPI_TENANT_EXTENSION]. */
  tenantId: string;
  /** Optional result payload. */
  result?: {
    /** Score as a fraction between 0 and 1. */
    scaled?: number;
    /** Raw score. */
    raw?: number;
    /** Whether the activity was completed. */
    completion?: boolean;
    /** Whether the learner passed. */
    success?: boolean;
  };
  /** Optional cmi5 registration UUID. */
  registration?: string;
}

/**
 * Client-side xAPI helper.
 *
 * - `buildStatement` constructs a spec-compliant statement object.
 * - `send` forwards it to the `ingestStatement` Firebase callable. When the
 *   device is offline (`navigator.onLine === false`) or the callable rejects,
 *   the statement is enqueued via `OfflineXapiQueue` and re-sent automatically
 *   when connectivity is restored. `send` never throws to callers.
 */
@Injectable({ providedIn: 'root' })
export class XapiClient {
  private readonly functions = inject(Functions, { optional: true });
  private readonly queue = inject(OfflineXapiQueue);

  constructor() {
    // Register this client's real-send as the queue's flush sender so that the
    // `window` online listener in OfflineXapiQueue can drain through us.
    this.queue.registerSender((s) => this._doSend(s));
  }

  /**
   * Build a valid xAPI statement from high-level options.
   * The actor is represented as an Agent with an account (pseudonymous uid).
   * The tenant id is embedded in context.extensions[XAPI_TENANT_EXTENSION].
   */
  buildStatement(opts: BuildStatementOpts): XapiStatement {
    const verbDescriptor = getVerb(opts.verb);

    const statement: XapiStatement = {
      actor: {
        objectType: 'Agent',
        name: opts.actorName,
        account: {
          homePage: opts.homePage,
          name: opts.uid,
        },
      },
      verb: {
        id: verbDescriptor.id,
        display: verbDescriptor.display,
      },
      object: {
        objectType: 'Activity',
        id: opts.activityId,
      },
      context: {
        registration: opts.registration,
        extensions: {
          [XAPI_TENANT_EXTENSION]: opts.tenantId,
        },
      },
      timestamp: new Date().toISOString(),
      tenantId: opts.tenantId,
      actorUid: opts.uid,
    };

    if (opts.result) {
      statement.result = {
        completion: opts.result.completion,
        success: opts.result.success,
        score:
          opts.result.scaled !== undefined || opts.result.raw !== undefined
            ? {
                scaled: opts.result.scaled,
                raw: opts.result.raw,
              }
            : undefined,
      };
    }

    return statement;
  }

  /**
   * Send a statement to the backend via the `ingestStatement` Firebase callable.
   *
   * Offline / failure behaviour:
   *  - If `navigator.onLine` is `false`, the statement is enqueued immediately
   *    without attempting a network call.
   *  - If the callable rejects (network error, server error, etc.), the
   *    statement is enqueued for retry on the next `window` `online` event.
   *  - Never throws — all errors are handled internally.
   *
   * Gracefully no-ops if Functions is unavailable (e.g. in unit test
   * environments that do not provide Firebase).
   */
  async send(statement: XapiStatement): Promise<void> {
    if (!this.functions) {
      console.warn('[XapiClient] Functions not available — statement not sent.');
      return;
    }

    // Guard: if we know we're offline, skip the network attempt entirely.
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (isOffline) {
      this.queue.enqueue(statement);
      return;
    }

    try {
      await this._doSend(statement);
    } catch (err) {
      console.warn('[XapiClient] send failed — enqueuing for retry', err);
      this.queue.enqueue(statement);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Perform the actual Firebase callable invocation.
   * Throws on failure so that callers (send / flush) can handle it.
   */
  private async _doSend(statement: XapiStatement): Promise<void> {
    if (!this.functions) return;
    const ingest = httpsCallable<XapiStatement, void>(this.functions, 'ingestStatement');
    await ingest(statement);
  }
}
