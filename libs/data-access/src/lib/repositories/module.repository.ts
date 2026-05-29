import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Module, module } from '@forge/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/**
 * Modules live under a course: tenants/{t}/courses/{courseId}/modules/{moduleId}.
 * A repository instance is scoped per (tenant, course).
 */
@Injectable({ providedIn: 'root' })
export class ModuleRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string, courseId: string): BaseRepository<Module> {
    return new BaseRepository<Module>(
      this.fs,
      FsPaths.modules(tenantId, courseId),
      module,
      'module',
    );
  }

  getById(tenantId: string, courseId: string, moduleId: string) {
    return this.repo(tenantId, courseId).getById(moduleId);
  }

  /** Ordered list of modules for a course. */
  listOrdered(tenantId: string, courseId: string) {
    return this.repo(tenantId, courseId).list(orderBy('order'));
  }

  set(tenantId: string, courseId: string, m: Module) {
    return this.repo(tenantId, courseId).set(m.id, m);
  }

  update(tenantId: string, courseId: string, moduleId: string, partial: Partial<Module>) {
    return this.repo(tenantId, courseId).update(moduleId, partial);
  }

  remove(tenantId: string, courseId: string, moduleId: string) {
    return this.repo(tenantId, courseId).remove(moduleId);
  }
}
