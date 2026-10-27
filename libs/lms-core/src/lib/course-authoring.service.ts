import { Injectable, inject } from '@angular/core';
import { CourseRepository, ModuleRepository } from '@assurance/data-access';
import type { ContentType, Course, Module } from '@assurance/shared';

export interface NewCourseInput {
  tenantId: string;
  title: string;
  description?: string;
  tags?: string[];
}

/** Editable course fields. Status is excluded: publishing stays a separate, explicit step. */
export type CourseUpdate = Partial<
  Pick<Course, 'title' | 'description' | 'tags' | 'xpReward' | 'availableOffline'>
>;

/** Editable module fields (order changes go through {@link CourseAuthoringService.reorder}). */
export type ModuleUpdate = Partial<
  Pick<
    Module,
    'title' | 'assetRef' | 'externalUrl' | 'estimatedMinutes' | 'xpReward' | 'completion'
  >
>;

export interface NewModuleInput {
  tenantId: string;
  courseId: string;
  title: string;
  contentType: ContentType;
  assetRef?: string;
  externalUrl?: string;
  order?: number;
  /** Microlearning estimated duration in whole minutes (MO-14). */
  estimatedMinutes?: number;
}

/**
 * No-code authoring domain service: create courses + add/reorder modules.
 * Writes go through the tenant-scoped repositories; Firestore rules enforce
 * that only author roles (tenant_admin/instructor/superadmin) may write.
 */
@Injectable({ providedIn: 'root' })
export class CourseAuthoringService {
  private readonly courses = inject(CourseRepository);
  private readonly modules = inject(ModuleRepository);

  async createCourse(input: NewCourseInput): Promise<Course> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const course: Course = {
      id,
      tenantId: input.tenantId,
      title: input.title,
      description: input.description ?? '',
      status: 'draft',
      tags: input.tags ?? [],
      badgeRefs: [],
      xpReward: 0,
      availableOffline: false,
      createdAt: now,
    };
    await this.courses.set(input.tenantId, course);
    return course;
  }

  async addModule(input: NewModuleInput): Promise<Module> {
    const existing = await this.modules.listOrdered(input.tenantId, input.courseId);
    const order = input.order ?? existing.length;
    const now = new Date().toISOString();
    const mod: Module = {
      id: crypto.randomUUID(),
      courseId: input.courseId,
      tenantId: input.tenantId,
      title: input.title,
      order,
      contentType: input.contentType,
      assetRef: input.assetRef,
      externalUrl: input.externalUrl,
      estimatedMinutes: input.estimatedMinutes,
      xpReward: 0,
      badgeRefs: [],
      completion: {},
      createdAt: now,
    };
    await this.modules.set(input.tenantId, input.courseId, mod);
    return mod;
  }

  /** Persist a new ordering (array of moduleIds in desired order). */
  async reorder(tenantId: string, courseId: string, orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) => this.modules.update(tenantId, courseId, id, { order: index })),
    );
  }

  updateCourse(tenantId: string, courseId: string, patch: CourseUpdate): Promise<void> {
    return this.courses.update(tenantId, courseId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  updateModule(
    tenantId: string,
    courseId: string,
    moduleId: string,
    patch: ModuleUpdate,
  ): Promise<void> {
    return this.modules.update(tenantId, courseId, moduleId, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  publish(course: Course): Promise<void> {
    return this.courses.set(course.tenantId, { ...course, status: 'published' });
  }
}
