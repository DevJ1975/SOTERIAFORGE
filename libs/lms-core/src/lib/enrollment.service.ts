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
   * Marks a module complete for the given learner.
   *
   * - Fetches the current enrollment (creates a default if missing).
   * - Adds `moduleId` to the completed-module list stored in `cmi.completedModuleIds`.
   * - Recomputes `progressPct` from the ratio of completed modules to `totalModules`.
   * - Sets `completed = true` when all modules are done.
   * - Persists via EnrollmentRepository.updateProgress.
   *
   * @param tenantId   - Tenant scope.
   * @param courseId   - Course being progressed.
   * @param uid        - Learner's Firebase Auth uid.
   * @param moduleId   - The module being marked complete.
   * @param totalModules - Total number of modules in the course (needed to
   *                       compute progressPct without loading module collection).
   * @param score      - Optional score (0–100) achieved in this module.
   */
  async markModuleComplete(
    tenantId: string,
    courseId: string,
    uid: string,
    moduleId: string,
    totalModules: number,
    score?: number,
  ): Promise<void> {
    const now = new Date().toISOString();

    // Fetch existing enrollment, or bootstrap a zero-progress one.
    let existing = await this.enrollmentRepo.get(tenantId, courseId, uid);
    if (!existing) {
      existing = {
        uid,
        courseId,
        tenantId,
        progressPct: 0,
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
    }

    // Build deduplicated completed-module id list.
    const prevIds: string[] = Array.isArray(existing.cmi?.['completedModuleIds'])
      ? (existing.cmi!['completedModuleIds'] as string[]).filter(
          (v): v is string => typeof v === 'string',
        )
      : [];

    const completedModuleIds = prevIds.includes(moduleId) ? prevIds : [...prevIds, moduleId];

    // Ratio of completed modules to total.
    const progressPct =
      totalModules > 0 ? Math.round((completedModuleIds.length / totalModules) * 100) : 0;

    const completed = progressPct >= 100;

    const partial: Partial<Enrollment> = {
      progressPct,
      completed,
      lastActivityAt: now,
      updatedAt: now,
      cmi: {
        ...(existing.cmi ?? {}),
        completedModuleIds,
      },
      ...(score !== undefined ? { score } : {}),
    };

    await this.enrollmentRepo.updateProgress(tenantId, courseId, uid, partial);
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
