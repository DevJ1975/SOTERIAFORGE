import { inject, Injectable } from '@angular/core';
import { getDoc, setDoc } from 'firebase/firestore';
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
   * Idempotent upsert: creates the learner's enrollment if absent, otherwise
   * returns the existing one untouched (preserving progress).
   */
  async enroll(
    tenantId: string,
    courseId: string,
    uid: string,
    email: string,
  ): Promise<Enrollment> {
    const existing = await this.getEnrollment(tenantId, courseId, uid);
    if (existing) return existing;

    const now = new Date().toISOString();
    const enrollment: Enrollment = {
      uid,
      courseId,
      tenantId,
      progressPct: 0,
      completed: false,
      lastActivityAt: now,
      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: email,
    };
    await setDoc(enrollmentDoc(this.db, tenantId, courseId, uid), enrollment);
    return enrollment;
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
