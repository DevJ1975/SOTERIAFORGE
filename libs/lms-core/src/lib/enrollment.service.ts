import { Injectable, inject } from '@angular/core';
import type { Enrollment } from '@assurance/shared';
import { EnrollmentRepository } from '@assurance/data-access';

/**
 * Application service for enrollment lifecycle management.
 *
 * Responsible for creating enrollments and updating progress after module
 * completion events. All writes go through EnrollmentRepository.
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly enrollmentRepo = inject(EnrollmentRepository);

  /**
   * Creates an initial enrollment doc for a learner joining a course.
   * Safe to call if the enrollment already exists — it overwrites with a
   * fresh zero-progress record (use with care; typically guard at call site).
   */
  async enroll(tenantId: string, courseId: string, uid: string): Promise<Enrollment> {
    const now = new Date().toISOString();
    const enrollment: Enrollment = {
      uid,
      courseId,
      tenantId,
      progressPct: 0,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.enrollmentRepo.upsert(tenantId, courseId, enrollment);
    return enrollment;
  }

  /**
   * Read the saved SCORM/cmi5 runtime state for a single module, so the player
   * can resume from the learner's bookmark/suspend_data (MO-09). Returns the
   * per-module `cmi.runtime[moduleId]` map, or `undefined` if there is no saved
   * state. With Firestore offline persistence (MO-01) this read is served from
   * the IndexedDB cache when offline.
   */
  async getRuntimeCmi(
    tenantId: string,
    courseId: string,
    uid: string,
    moduleId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const existing = await this.enrollmentRepo.get(tenantId, courseId, uid);
    const runtime = existing?.cmi?.['runtime'] as Record<string, unknown> | undefined;
    const moduleCmi = runtime?.[moduleId];
    return moduleCmi && typeof moduleCmi === 'object'
      ? (moduleCmi as Record<string, unknown>)
      : undefined;
  }

  /**
   * Persist SCORM/cmi5 runtime data for a module under the enrollment's `cmi`
   * map, namespaced per module so multiple SCORM modules don't collide. Called
   * by the SCORM runtime on commit/finish.
   */
  async saveCmi(
    tenantId: string,
    courseId: string,
    uid: string,
    moduleId: string,
    cmi: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.enrollmentRepo.get(tenantId, courseId, uid);
    const now = new Date().toISOString();
    const runtime = (existing?.cmi?.['runtime'] as Record<string, unknown>) ?? {};
    await this.enrollmentRepo.updateProgress(tenantId, courseId, uid, {
      lastActivityAt: now,
      updatedAt: now,
      cmi: {
        ...(existing?.cmi ?? {}),
        runtime: { ...runtime, [moduleId]: cmi },
      },
    });
  }
}
