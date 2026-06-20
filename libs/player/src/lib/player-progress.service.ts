import { Injectable, inject } from '@angular/core';
import type { Module } from '@assurance/shared';
import { XAPI_TENANT_EXTENSION } from '@assurance/shared';
import { ModuleCompletionService } from '@assurance/lms-core';
import { XapiClient } from '@assurance/standards';

export interface PlayerContext {
  tenantId: string;
  courseId: string;
  module: Module;
  uid: string;
}

const HOME_PAGE = 'https://soteriaforge.com';

/**
 * Bridges content-player events (progress / completion) to the LMS backend
 * (EnrollmentService) and the xAPI pipeline (XapiClient).
 *
 * All methods are fire-and-forget: failures are caught and logged but never
 * re-thrown so the player UI never breaks due to tracking errors.
 */
@Injectable({ providedIn: 'root' })
export class PlayerProgressService {
  private readonly completion = inject(ModuleCompletionService);
  private readonly xapi = inject(XapiClient);

  /**
   * Records a progress percentage for the current module.
   * Emits an xAPI 'progressed' statement (best-effort).
   */
  async recordProgress(ctx: PlayerContext, pct: number): Promise<void> {
    try {
      const stmt = this.xapi.buildStatement({
        uid: ctx.uid,
        homePage: HOME_PAGE,
        verb: 'progressed',
        activityId: this.activityId(ctx),
        tenantId: ctx.tenantId,
        result: { scaled: pct / 100 },
      });
      await this.xapi.send(stmt);
    } catch (err) {
      console.warn('[PlayerProgressService] recordProgress failed', err);
    }
  }

  /**
   * Records module completion:
   *  1. Reports completion to the server-authoritative `completeModule` function
   *     via the offline-durable outbox (MO-10), which recomputes progress and
   *     grants XP/badges/streak (anti-cheat). When offline or the callable
   *     rejects, the completion is persisted and retried on reconnect/relaunch.
   *  2. Emits an xAPI 'completed' statement with optional score — but ONLY once
   *     the authoritative completion is confirmed OR durably queued, so the LRS
   *     never says "completed" while the LMS has no record (no divergence).
   *
   * `completeModule` is a callable (not a Firestore write), so it is not covered
   * by Firestore offline persistence (MO-01) — the outbox is what makes it
   * offline-durable. The xAPI statement itself is durably queued by the xAPI
   * pipeline (MO-05); we just defer emitting it until the completion is durable.
   */
  async recordCompletion(ctx: PlayerContext, score?: number): Promise<void> {
    let completionDurable = false;
    try {
      const outcome = await this.completion.completeWithOutbox({
        tenantId: ctx.tenantId,
        courseId: ctx.courseId,
        moduleId: ctx.module.id,
        score,
      });
      completionDurable = outcome.durable;
    } catch (err) {
      console.warn('[PlayerProgressService] completeModule failed', err);
    }

    // Guard against LRS/LMS divergence: if the authoritative completion could
    // not even be durably queued (e.g. IndexedDB unavailable), do NOT emit the
    // xAPI `completed` statement — otherwise the LRS would record completion the
    // LMS never gets.
    if (!completionDurable) {
      console.warn(
        '[PlayerProgressService] completion not durable — skipping xAPI completed to avoid LRS/LMS divergence',
      );
      return;
    }

    try {
      const stmt = this.xapi.buildStatement({
        uid: ctx.uid,
        homePage: HOME_PAGE,
        verb: 'completed',
        activityId: this.activityId(ctx),
        tenantId: ctx.tenantId,
        result: {
          completion: true,
          ...(score !== undefined ? { scaled: score / 100, raw: score } : {}),
        },
      });
      // Stamp tenant id in context.extensions (belt + suspenders)
      stmt.context = {
        ...(stmt.context ?? {}),
        extensions: {
          ...(stmt.context?.extensions ?? {}),
          [XAPI_TENANT_EXTENSION]: ctx.tenantId,
        },
      };
      await this.xapi.send(stmt);
    } catch (err) {
      console.warn('[PlayerProgressService] xAPI completed statement failed', err);
    }
  }

  private activityId(ctx: PlayerContext): string {
    return `${HOME_PAGE}/tenants/${ctx.tenantId}/courses/${ctx.courseId}/modules/${ctx.module.id}`;
  }
}
