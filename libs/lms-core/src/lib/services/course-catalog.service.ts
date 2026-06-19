import { inject, Injectable } from '@angular/core';
import { getDocs, query, where } from 'firebase/firestore';
import { getDoc } from 'firebase/firestore';
import { coursesCol, courseDoc, FIRESTORE } from '@forge/data-access';
import type { Course } from '@forge/shared';

/**
 * Reads tenant course catalog metadata (the `course` schema). The player
 * content (CourseDraft) lives in a separate subcollection — see
 * {@link CourseContentService}.
 */
@Injectable({ providedIn: 'root' })
export class CourseCatalogService {
  private readonly db = inject(FIRESTORE);

  /** Published courses for a tenant, in their natural document order. */
  async listPublished(tenantId: string): Promise<Course[]> {
    const published = query(coursesCol(this.db, tenantId), where('status', '==', 'published'));
    const snapshot = await getDocs(published);
    return snapshot.docs.map((d) => d.data());
  }

  /** A single course's catalog metadata, or undefined if it does not exist. */
  async get(tenantId: string, courseId: string): Promise<Course | undefined> {
    const snapshot = await getDoc(courseDoc(this.db, tenantId, courseId));
    return snapshot.exists() ? snapshot.data() : undefined;
  }
}
