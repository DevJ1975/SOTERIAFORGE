import { courseDraftDoc, courseDraftsCol } from '@forge/data-access';
import { courseDraft, type CourseDraft } from '@forge/shared';
import { deleteDoc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { CourseRepository } from './course-repository';
import { createId } from './create-id';
import { deepClone } from './history';

export interface FirestoreCourseRepositoryOptions {
  db: Firestore;
  /**
   * Getter (not a snapshot) so the tenant can change after sign-in/sign-out
   * without re-creating the repository. Return null while signed out.
   */
  tenantId: () => string | null;
}

/**
 * Multi-tenant Firestore CourseRepository for Forge Studio, persisting drafts
 * at /tenants/{tenantId}/courseDrafts/{courseId} (see @forge/data-access
 * courseDraftsCol / courseDraftDoc; every read and write goes through the
 * zod converter).
 *
 * Semantics mirror {@link LocalStorageCourseRepository}: list is ordered by
 * updatedAt desc, save is insert-or-update by id, duplicate deep-copies with
 * a fresh id, "<title> (Copy)", draft status and fresh timestamps.
 *
 * Every method resolves the tenant lazily via `tenantId()` and rejects with a
 * clear error when no tenant context exists (signed out).
 */
export class FirestoreCourseRepository implements CourseRepository {
  constructor(private readonly options: FirestoreCourseRepositoryOptions) {}

  private requireTenant(): string {
    const tenantId = this.options.tenantId();
    if (!tenantId) {
      throw new Error('No tenant context — sign in first');
    }
    return tenantId;
  }

  // Firestore I/O is isolated in small protected seams so unit tests can stub
  // them without standing up a real Firestore instance.

  protected async fetchAll(tenantId: string): Promise<CourseDraft[]> {
    const snapshot = await getDocs(
      query(courseDraftsCol(this.options.db, tenantId), orderBy('updatedAt', 'desc')),
    );
    return snapshot.docs.map((docSnapshot) => docSnapshot.data());
  }

  protected async fetchOne(tenantId: string, id: string): Promise<CourseDraft | undefined> {
    const snapshot = await getDoc(courseDraftDoc(this.options.db, tenantId, id));
    return snapshot.exists() ? snapshot.data() : undefined;
  }

  protected async writeOne(tenantId: string, course: CourseDraft): Promise<void> {
    await setDoc(courseDraftDoc(this.options.db, tenantId, course.id), course);
  }

  protected async deleteOne(tenantId: string, id: string): Promise<void> {
    await deleteDoc(courseDraftDoc(this.options.db, tenantId, id));
  }

  async list(): Promise<CourseDraft[]> {
    return this.fetchAll(this.requireTenant());
  }

  async get(id: string): Promise<CourseDraft | undefined> {
    return this.fetchOne(this.requireTenant(), id);
  }

  async save(course: CourseDraft): Promise<void> {
    const validated = courseDraft.parse(course);
    await this.writeOne(this.requireTenant(), validated);
  }

  async delete(id: string): Promise<void> {
    await this.deleteOne(this.requireTenant(), id);
  }

  async duplicate(id: string): Promise<CourseDraft | undefined> {
    const tenantId = this.requireTenant();
    const source = await this.fetchOne(tenantId, id);
    if (!source) return undefined;
    const now = new Date().toISOString();
    const copy: CourseDraft = {
      ...deepClone(source),
      id: createId('course'),
      title: `${source.title} (Copy)`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    await this.writeOne(tenantId, copy);
    return copy;
  }
}

export interface DelegatingCourseRepositoryOptions {
  firestore: CourseRepository;
  local: CourseRepository;
  /** Evaluated per call, so the backend follows the live auth state. */
  useFirestore: () => boolean;
}

/**
 * CourseRepository that picks a backend per call: Firestore when
 * `useFirestore()` is true (signed in with a tenant), localStorage otherwise.
 * The admin app provides this behind COURSE_REPOSITORY so Forge Studio works
 * signed-out and signed-in with zero builder changes.
 */
export class DelegatingCourseRepository implements CourseRepository {
  constructor(private readonly options: DelegatingCourseRepositoryOptions) {}

  private get active(): CourseRepository {
    return this.options.useFirestore() ? this.options.firestore : this.options.local;
  }

  list(): Promise<CourseDraft[]> {
    return this.active.list();
  }

  get(id: string): Promise<CourseDraft | undefined> {
    return this.active.get(id);
  }

  save(course: CourseDraft): Promise<void> {
    return this.active.save(course);
  }

  delete(id: string): Promise<void> {
    return this.active.delete(id);
  }

  duplicate(id: string): Promise<CourseDraft | undefined> {
    return this.active.duplicate(id);
  }
}
