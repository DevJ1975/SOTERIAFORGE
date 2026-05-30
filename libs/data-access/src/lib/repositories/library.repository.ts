import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Course, type Module, course, module } from '@assurance/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** Sentinel tenant id for global-library course templates. */
export const LIBRARY_TENANT = 'platform';

/**
 * Global course library (platform-level). Superadmin authors course templates
 * here; `shareLibraryCourse` copies them into individual tenants. Reuses the
 * Course/Module schemas with `tenantId === LIBRARY_TENANT`.
 */
@Injectable({ providedIn: 'root' })
export class LibraryRepository {
  private readonly fs = inject(Firestore);

  private courses(): BaseRepository<Course> {
    return new BaseRepository<Course>(this.fs, FsPaths.library(), course, 'libraryCourse');
  }
  private modules(courseId: string): BaseRepository<Module> {
    return new BaseRepository<Module>(
      this.fs,
      FsPaths.libraryModules(courseId),
      module,
      'libraryModule',
    );
  }

  list() {
    return this.courses().list(orderBy('title'));
  }
  getCourse(courseId: string) {
    return this.courses().getById(courseId);
  }
  setCourse(c: Course) {
    return this.courses().set(c.id, c);
  }
  listModules(courseId: string) {
    return this.modules(courseId).list(orderBy('order'));
  }
  setModule(courseId: string, m: Module) {
    return this.modules(courseId).set(m.id, m);
  }
}
