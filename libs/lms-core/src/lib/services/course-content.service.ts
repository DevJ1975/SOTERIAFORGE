import { inject, Injectable } from '@angular/core';
import { getDoc } from 'firebase/firestore';
import { courseContentDoc, FIRESTORE } from '@forge/data-access';
import type { CourseDraft } from '@forge/shared';

/**
 * Loads the rich player content (a {@link CourseDraft}) stored at
 * `courses/{courseId}/content/draft`. The renderer consumes its `lessons`.
 */
@Injectable({ providedIn: 'root' })
export class CourseContentService {
  private readonly db = inject(FIRESTORE);

  /** The course's player content draft, or undefined if it has not been authored. */
  async getContent(tenantId: string, courseId: string): Promise<CourseDraft | undefined> {
    const snapshot = await getDoc(courseContentDoc(this.db, tenantId, courseId));
    return snapshot.exists() ? snapshot.data() : undefined;
  }
}
