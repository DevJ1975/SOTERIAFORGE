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
   *  1. Reports completion to the server-authoritative `completeModule` function,
   *     which recomputes progress and grants XP/badges/streak (anti-cheat).
   *  2. Emits an xAPI 'completed' statement with optional score.
   */
  async recordCompletion(ctx: PlayerContext, score?: number): Promise<void> {
    try {
      await this.completion.complete({
        tenantId: ctx.tenantId,
        courseId: ctx.courseId,
        moduleId: ctx.module.id,
        score,
      });
    } catch (err) {
      console.warn('[PlayerProgressService] completeModule failed', err);
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
