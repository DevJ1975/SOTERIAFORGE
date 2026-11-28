import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import type { ApiCourse, ApiCourseOutline, ApiLesson, ContentType } from '@assurance/lms-core';
import { firstValueFrom } from 'rxjs';

/*
 * The global course library: a reserved platform tenant ("library"). Authoring uses the
 * normal course/module/lesson API acting in that tenant via X-Forge-Tenant; sharing
 * copies a course into tenants as drafts (backend/apps/learning, library).
 */

export const LIBRARY_TENANT = 'library';

export interface ShareLibraryCourseResult {
  created: { tenantId: string; courseId: string }[];
}

export interface LessonInput {
  title: string;
  contentType: ContentType;
  externalUrl?: string;
  assetRef?: string;
  estimatedMinutes?: number | null;
}

export interface ApiModule {
  id: string;
  courseId: string;
  title: string;
  label: string;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;
  private readonly libraryHeaders = new HttpHeaders({ 'X-Forge-Tenant': LIBRARY_TENANT });

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  private get headers() {
    return { headers: this.libraryHeaders };
  }

  list(): Promise<ApiCourse[]> {
    return firstValueFrom(this.http.get<ApiCourse[]>(this.url('library/courses')));
  }

  course(courseId: string): Promise<ApiCourseOutline> {
    return firstValueFrom(
      this.http.get<ApiCourseOutline>(this.url(`courses/${courseId}`), this.headers),
    );
  }

  createCourse(input: { title: string; description?: string }): Promise<ApiCourse> {
    return firstValueFrom(this.http.post<ApiCourse>(this.url('courses'), input, this.headers));
  }

  updateCourse(
    courseId: string,
    patch: Partial<Pick<ApiCourse, 'title' | 'description' | 'status' | 'tags'>>,
  ): Promise<ApiCourse> {
    return firstValueFrom(
      this.http.patch<ApiCourse>(this.url(`courses/${courseId}`), patch, this.headers),
    );
  }

  addModule(courseId: string, input: { title: string; label?: string }): Promise<ApiModule> {
    return firstValueFrom(
      this.http.post<ApiModule>(this.url(`courses/${courseId}/modules`), input, this.headers),
    );
  }

  deleteModule(moduleId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`modules/${moduleId}`), this.headers));
  }

  addLesson(moduleId: string, input: LessonInput): Promise<ApiLesson> {
    return firstValueFrom(
      this.http.post<ApiLesson>(this.url(`modules/${moduleId}/lessons`), input, this.headers),
    );
  }

  deleteLesson(lessonId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`lessons/${lessonId}`), this.headers));
  }

  /** Copies the course (modules, lessons, quizzes) into each tenant as a draft. */
  share(courseId: string, tenantIds: string[]): Promise<ShareLibraryCourseResult> {
    return firstValueFrom(
      this.http.post<ShareLibraryCourseResult>(this.url(`library/courses/${courseId}/share`), {
        tenantIds,
      }),
    );
  }
}
