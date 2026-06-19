import { inject, Injectable } from '@angular/core';
import { setDoc } from 'firebase/firestore';
import { enrollmentDoc, FIRESTORE } from '@forge/data-access';
import type { Enrollment } from '@forge/shared';
import { EnrollmentService } from './enrollment.service';

/**
 * Writes the learner's OWN enrollment doc as they move through a course.
 *
 * Note: this only advances the enrollment (allowed by the security rules). It
 * never writes the member doc — live XP/level/streak updates are a Phase-4
 * Cloud Function; the demo surfaces XP as a client-side projection only.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly db = inject(FIRESTORE);
  private readonly enrollments = inject(EnrollmentService);

  /**
   * Records which lessons the learner has completed and derives `progressPct`.
   * Upserts the enrollment (enrolling implicitly if needed) so the call is safe
   * even before an explicit enroll().
   */
  async setLessonProgress(
    tenantId: string,
    courseId: string,
    uid: string,
    completedLessonIds: string[],
    totalLessons: number,
  ): Promise<Enrollment> {
    const unique = new Set(completedLessonIds);
    const progressPct =
      totalLessons > 0 ? Math.min(100, Math.round((unique.size / totalLessons) * 100)) : 0;
    return this.write(tenantId, courseId, uid, {
      progressPct,
      completed: progressPct >= 100,
    });
  }

  /** Marks the course complete: `completed = true`, `progressPct = 100`. */
  async completeCourse(
    tenantId: string,
    courseId: string,
    uid: string,
    score?: number,
  ): Promise<Enrollment> {
    return this.write(tenantId, courseId, uid, {
      progressPct: 100,
      completed: true,
      ...(score === undefined ? {} : { score }),
    });
  }

  /** Reads the current enrollment, applies the patch, and persists it. */
  private async write(
    tenantId: string,
    courseId: string,
    uid: string,
    patch: Partial<Enrollment>,
  ): Promise<Enrollment> {
    const now = new Date().toISOString();
    const existing = await this.enrollments.getEnrollment(tenantId, courseId, uid);
    const base: Enrollment = existing ?? {
      uid,
      courseId,
      tenantId,
      progressPct: 0,
      completed: false,
      createdAt: now,
      createdBy: uid,
    };
    const next: Enrollment = {
      ...base,
      ...patch,
      uid,
      courseId,
      tenantId,
      lastActivityAt: now,
      updatedAt: now,
      updatedBy: uid,
    };
    await setDoc(enrollmentDoc(this.db, tenantId, courseId, uid), next);
    return next;
  }
}
