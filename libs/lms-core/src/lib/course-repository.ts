import { InjectionToken } from '@angular/core';
import { courseDraft, type CourseDraft } from '@forge/shared';
import { createId } from './create-id';
import { deepClone } from './history';

/**
 * Persistence boundary for Forge Studio course drafts. The builder only ever
 * talks to this interface, so swapping localStorage for Firestore later is a
 * provider change, not a refactor.
 */
export interface CourseRepository {
  /** All courses, most recently updated first. */
  list(): Promise<CourseDraft[]>;
  get(id: string): Promise<CourseDraft | undefined>;
  /** Insert-or-update by id. */
  save(course: CourseDraft): Promise<void>;
  delete(id: string): Promise<void>;
  /** Deep-copy a course as a fresh draft. Resolves the copy, or undefined if missing. */
  duplicate(id: string): Promise<CourseDraft | undefined>;
}

export const COURSE_REPOSITORY = new InjectionToken<CourseRepository>('forge.course-repository');

/** localStorage key for the authoring store (versioned for future migrations). */
export const AUTHORING_STORAGE_KEY = 'forge.authoring.v1';

/**
 * Browser-local CourseRepository backed by a single localStorage entry
 * holding a JSON array of course drafts.
 *
 * - Every record is zod-validated on read; corrupt entries are skipped (and
 *   logged) instead of poisoning the whole list.
 * - Environments without localStorage (SSR, locked-down browsers) degrade to
 *   an in-memory map so the builder still works for the session.
 */
export class LocalStorageCourseRepository implements CourseRepository {
  /** Session fallback when localStorage is unavailable. */
  private memory: CourseDraft[] = [];

  private get storage(): Storage | undefined {
    try {
      if (typeof localStorage === 'undefined') return undefined;
      return localStorage;
    } catch {
      return undefined;
    }
  }

  private readAll(): CourseDraft[] {
    const storage = this.storage;
    if (!storage) return deepClone(this.memory);

    let raw: string | null = null;
    try {
      raw = storage.getItem(AUTHORING_STORAGE_KEY);
    } catch {
      return deepClone(this.memory);
    }
    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[forge] authoring store is not valid JSON; starting fresh');
      return [];
    }
    if (!Array.isArray(parsed)) return [];

    const courses: CourseDraft[] = [];
    for (const entry of parsed) {
      const result = courseDraft.safeParse(entry);
      if (result.success) {
        courses.push(result.data);
      } else {
        console.warn('[forge] skipping corrupt course entry in authoring store', result.error);
      }
    }
    return courses;
  }

  private writeAll(courses: CourseDraft[]): void {
    const storage = this.storage;
    if (!storage) {
      this.memory = deepClone(courses);
      return;
    }
    try {
      storage.setItem(AUTHORING_STORAGE_KEY, JSON.stringify(courses));
    } catch {
      // Quota exceeded or storage disabled mid-session: keep an in-memory copy.
      this.memory = deepClone(courses);
    }
  }

  async list(): Promise<CourseDraft[]> {
    return this.readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<CourseDraft | undefined> {
    return this.readAll().find((course) => course.id === id);
  }

  async save(course: CourseDraft): Promise<void> {
    const validated = courseDraft.parse(course);
    const courses = this.readAll();
    const index = courses.findIndex((existing) => existing.id === validated.id);
    if (index >= 0) {
      courses[index] = validated;
    } else {
      courses.push(validated);
    }
    this.writeAll(courses);
  }

  async delete(id: string): Promise<void> {
    this.writeAll(this.readAll().filter((course) => course.id !== id));
  }

  async duplicate(id: string): Promise<CourseDraft | undefined> {
    const source = await this.get(id);
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
    await this.save(copy);
    return copy;
  }
}
