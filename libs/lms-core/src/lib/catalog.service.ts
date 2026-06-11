import { Injectable } from '@angular/core';
import { getDoc, getDocs, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { courseDraftDoc, courseDraftsCol } from '@forge/data-access';
import type { CourseDraft } from '@forge/shared';

/**
 * Catalog projection of a published course draft: just what the learner-facing
 * catalog grid needs to render a card.
 */
export interface CatalogCourse {
  id: string;
  title: string;
  /** Short plain-text excerpt of the course description (may be empty). */
  excerpt: string;
  coverImageUrl?: string;
  lessonCount: number;
}

/** Max length of a catalog card excerpt, ellipsis included. */
export const EXCERPT_MAX_LENGTH = 160;

/**
 * Collapses whitespace and truncates `text` to `max` characters, cutting on a
 * word boundary where possible and appending an ellipsis when truncated.
 */
export function excerptOf(text: string, max = EXCERPT_MAX_LENGTH): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  // Only respect the word boundary when it doesn't eat most of the excerpt.
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Maps a course draft onto its catalog-card projection. */
export function toCatalogCourse(course: CourseDraft): CatalogCourse {
  return {
    id: course.id,
    title: course.title,
    excerpt: excerptOf(course.description),
    coverImageUrl: course.coverImageUrl,
    lessonCount: course.lessons.length,
  };
}

/** Newest-first by updatedAt (ISO strings compare lexicographically). */
export function sortByUpdatedAtDesc(courses: CourseDraft[]): CourseDraft[] {
  return [...courses].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Learner-side course catalog: published Forge Studio course drafts for the
 * current tenant, read from /tenants/{tenantId}/courseDrafts.
 *
 * The `status == 'published'` filter is not just cosmetic — firestore.rules
 * only lets non-authoring tenant members read published drafts, so an
 * unfiltered list query would be rejected outright.
 */
@Injectable({ providedIn: 'root' })
export class ForgeCatalog {
  /** All published courses for the tenant, most recently updated first. */
  async listPublished(db: Firestore, tenantId: string): Promise<CourseDraft[]> {
    const snapshot = await getDocs(
      query(courseDraftsCol(db, tenantId), where('status', '==', 'published')),
    );
    return sortByUpdatedAtDesc(snapshot.docs.map((docSnapshot) => docSnapshot.data()));
  }

  /**
   * A single published course by id, or undefined when missing or not
   * published (drafts stay invisible to learners even by direct link).
   */
  async getPublished(
    db: Firestore,
    tenantId: string,
    courseId: string,
  ): Promise<CourseDraft | undefined> {
    const snapshot = await getDoc(courseDraftDoc(db, tenantId, courseId));
    if (!snapshot.exists()) return undefined;
    const course = snapshot.data();
    return course.status === 'published' ? course : undefined;
  }
}
