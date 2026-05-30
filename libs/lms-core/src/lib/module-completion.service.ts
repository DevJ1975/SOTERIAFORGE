import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface CompleteModuleInput {
  tenantId: string;
  courseId: string;
  moduleId: string;
  score?: number;
}

export interface CompleteModuleResult {
  ok: boolean;
  progressPct: number;
  completed: boolean;
  firstCompletion: boolean;
}

/**
 * Reports non-quiz module completion to the server-authoritative `completeModule`
 * function, which recomputes progress and grants XP/badges/streak (anti-cheat).
 * The client never decides rewards. Tolerant of failure (no throw to UI).
 */
@Injectable({ providedIn: 'root' })
export class ModuleCompletionService {
  private readonly fns = inject(Functions, { optional: true });

  async complete(input: CompleteModuleInput): Promise<CompleteModuleResult | null> {
    if (!this.fns) return null;
    try {
      const call = httpsCallable<CompleteModuleInput, CompleteModuleResult>(
        this.fns,
        'completeModule',
      );
      return (await call(input)).data;
    } catch {
      return null;
    }
  }
}
