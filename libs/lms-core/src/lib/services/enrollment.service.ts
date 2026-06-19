import { inject, Injectable } from '@angular/core';
import { getDoc, runTransaction } from 'firebase/firestore';
import { enrollmentDoc, FIRESTORE } from '@forge/data-access';
import type { Course, Enrollment } from '@forge/shared';
import { CourseCatalogService } from './course-catalog.service';

/** A learner's enrollment paired with its course catalog metadata. */
export interface EnrolledCourse {
  course: Course;
  enrollment: Enrollment;
}

/**
 * Manages a learner's enrollment documents (keyed by uid under each course).
 * The learner may upsert their own enrollment per the security rules.
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly db = inject(FIRESTORE);
  private readonly catalog = inject(CourseCatalogService);

  /**
   * Idempotent create-if-absent: creates the learner's enrollment if absent,
   * otherwise returns the existing one untouched (preserving progress).
   *
   * The read-then-create runs inside a `runTransaction` so two parallel enrolls
   * (the shift-change thundering herd) cannot both create — the loser reads the
   * winner's doc inside the same transaction and returns it untouched.
   *
   * `email` is accepted per the service contract but the audit fields record
   * the actor's `uid` (the audit convention everywhere else); `email` is a
   * mailbox, not a stable identity, so it must never land in `updatedBy`.
   */
  async enroll(
    tenantId: string,
    courseId: string,
    uid: string,
    email: string,
  ): Promise<Enrollment> {
    void email;
    const ref = enrollmentDoc(this.db, tenantId, courseId, uid);
    return runTransaction(this.db, async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists()) return snapshot.data();

      const now = new Date().toISOString();
      const enrollment: Enrollment = {
        uid,
        courseId,
        tenantId,
        progressPct: 0,
        completed: false,
        progressVersion: 0,
        completedLessonIds: [],
        attemptCount: 0,
        lastActivityAt: now,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      };
      tx.set(ref, enrollment);
      return enrollment;
    });
  }

  /** The learner's enrollment in a course, or undefined if not enrolled. */
  async getEnrollment(
    tenantId: string,
    courseId: string,
    uid: string,
  ): Promise<Enrollment | undefined> {
    const snapshot = await getDoc(enrollmentDoc(this.db, tenantId, courseId, uid));
    return snapshot.exists() ? snapshot.data() : undefined;
  }

  /**
   * The learner's enrollments across the tenant's published catalog, each
   * paired with its course metadata. Courses without an enrollment are omitted.
   */
  async listMyEnrollments(tenantId: string, uid: string): Promise<EnrolledCourse[]> {
    const courses = await this.catalog.listPublished(tenantId);
    const results = await Promise.all(
      courses.map(async (course) => {
        const enrollment = await this.getEnrollment(tenantId, course.id, uid);
        return enrollment ? { course, enrollment } : undefined;
      }),
    );
    return results.filter((r): r is EnrolledCourse => r !== undefined);
  }
}
