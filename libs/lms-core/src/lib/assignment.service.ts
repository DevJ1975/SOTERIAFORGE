import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface AssignCourseInput {
  tenantId: string;
  courseId: string;
  uids: string[];
  dueAt?: string;
}

/**
 * Assigns a course to learners via the server-authoritative `assignCourse`
 * function (admins/instructors cannot create other users' enrollments under
 * Firestore rules, so assignment goes server-side).
 */
@Injectable({ providedIn: 'root' })
export class AssignmentService {
  private readonly fns = inject(Functions, { optional: true });

  async assign(input: AssignCourseInput): Promise<{ assigned: number; skipped: number } | null> {
    if (!this.fns) return null;
    const call = httpsCallable<
      AssignCourseInput,
      { ok: boolean; assigned: number; skipped: number }
    >(this.fns, 'assignCourse');
    const res = await call(input);
    return { assigned: res.data.assigned, skipped: res.data.skipped };
  }
}
