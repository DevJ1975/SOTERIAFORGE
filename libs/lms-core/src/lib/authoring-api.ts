import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import type { QuizQuestion } from '@assurance/shared';
import { firstValueFrom } from 'rxjs';
import {
  type ApiCourse,
  type ApiCourseOutline,
  type ApiLesson,
  type ContentType,
  apiErrorMessage,
} from './learning-api';

/*
 * Forge API authoring endpoints (backend/apps/learning, assessments, games and assets).
 * Tenant staff only; the server enforces roles and scopes everything to the acting tenant.
 * The old "module" (one content item) is a lesson inside a module group here.
 */

export type CourseStatus = 'draft' | 'published' | 'archived';

export interface NewCourseInput {
  title: string;
  description?: string;
  tags?: string[];
  availableOffline?: boolean;
}

/** Editable course fields. Status changes go through {@link AuthoringApi.setCourseStatus}. */
export type CourseUpdate = Partial<
  Pick<ApiCourse, 'title' | 'description' | 'tags' | 'availableOffline'>
>;

export interface ApiModule {
  id: string;
  courseId: string;
  title: string;
  label: string;
  order: number;
}

export interface NewModuleInput {
  title: string;
  label?: string;
  order?: number;
}

export type ModuleUpdate = Partial<NewModuleInput>;

export interface KeyPoint {
  title: string;
  body: string;
}

/** Lesson write shape (`LessonWriteSerializer`). `quizId: null` detaches the quiz. */
export interface LessonInput {
  title: string;
  contentType: ContentType;
  order?: number;
  assetRef?: string;
  externalUrl?: string;
  scormVersion?: '1.2' | '2004' | '';
  estimatedMinutes?: number | null;
  xpReward?: number;
  frameworkTags?: string[];
  keyPoints?: KeyPoint[];
  quizId?: string | null;
}

export type LessonUpdate = Partial<LessonInput>;

export interface ApiQuiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  passThreshold: number;
  maxAttempts: number | null;
  createdAt: string;
  updatedAt: string;
}

export type QuizInput = Partial<
  Pick<ApiQuiz, 'title' | 'questions' | 'passThreshold' | 'maxAttempts'>
>;

export interface ApiGame {
  id: string;
  tenantId: string;
  title: string;
  engine: 'phaser' | 'pixi' | 'rive';
  config: Record<string, unknown>;
  assetRefs: string[];
  riveAssetRef: string;
  createdAt: string;
  updatedAt: string;
}

export type GameInput = Partial<
  Pick<ApiGame, 'title' | 'engine' | 'config' | 'assetRefs' | 'riveAssetRef'>
>;

export interface AssignInput {
  memberIds: string[];
  /** ISO timestamp. */
  dueAt?: string;
}

export interface AssignResult {
  assigned: number;
  skipped: number;
}

export interface UploadedAsset {
  id: string;
  /** `asset:<id>`, what a lesson stores in `assetRef`. */
  assetRef: string;
  filename: string;
  contentType: string;
  size: number;
}

/** Flattens a DRF validation body (`{field: ["msg"]}`) into one readable line. */
function validationMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(body)) {
    const text = Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ')
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
    parts.push(`${field}: ${text}`);
  }
  return parts.length ? parts.join('; ') : null;
}

/** The API's `detail` or its field validation errors when there are any, else `fallback`. */
export function authoringErrorMessage(error: unknown, fallback: string): string {
  const detail = apiErrorMessage(error, '');
  if (detail) return detail;
  if (error instanceof HttpErrorResponse && error.status === 400) {
    return validationMessage(error.error) ?? fallback;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class AuthoringApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  // --- courses -------------------------------------------------------------

  courses(): Promise<ApiCourse[]> {
    return firstValueFrom(this.http.get<ApiCourse[]>(this.url('courses')));
  }

  /** The course with its modules and lesson summaries, in learner order. */
  course(courseId: string): Promise<ApiCourseOutline> {
    return firstValueFrom(this.http.get<ApiCourseOutline>(this.url(`courses/${courseId}`)));
  }

  /** Always a draft: publishing is a separate, explicit step. */
  createCourse(input: NewCourseInput): Promise<ApiCourse> {
    return firstValueFrom(this.http.post<ApiCourse>(this.url('courses'), input));
  }

  updateCourse(courseId: string, patch: CourseUpdate): Promise<ApiCourse> {
    return firstValueFrom(this.http.patch<ApiCourse>(this.url(`courses/${courseId}`), patch));
  }

  setCourseStatus(courseId: string, status: CourseStatus): Promise<ApiCourse> {
    return firstValueFrom(this.http.patch<ApiCourse>(this.url(`courses/${courseId}`), { status }));
  }

  publish(courseId: string): Promise<ApiCourse> {
    return this.setCourseStatus(courseId, 'published');
  }

  unpublish(courseId: string): Promise<ApiCourse> {
    return this.setCourseStatus(courseId, 'draft');
  }

  /** Staff assign a published course to members. Existing enrollments keep their progress. */
  assign(courseId: string, input: AssignInput): Promise<AssignResult> {
    return firstValueFrom(
      this.http.post<AssignResult>(this.url(`courses/${courseId}/assign`), input),
    );
  }

  // --- modules -------------------------------------------------------------

  addModule(courseId: string, input: NewModuleInput): Promise<ApiModule> {
    return firstValueFrom(
      this.http.post<ApiModule>(this.url(`courses/${courseId}/modules`), input),
    );
  }

  updateModule(moduleId: string, patch: ModuleUpdate): Promise<ApiModule> {
    return firstValueFrom(this.http.patch<ApiModule>(this.url(`modules/${moduleId}`), patch));
  }

  /** Refused (409) when learners already have progress in the module. */
  async deleteModule(moduleId: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`modules/${moduleId}`)));
  }

  /** Persist a new module ordering (ids in the desired order). */
  async reorderModules(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, order) => this.updateModule(id, { order })));
  }

  // --- lessons -------------------------------------------------------------

  /** Full lesson, including asset, URL and key points (the outline only carries summaries). */
  lesson(lessonId: string): Promise<ApiLesson> {
    return firstValueFrom(this.http.get<ApiLesson>(this.url(`lessons/${lessonId}`)));
  }

  addLesson(moduleId: string, input: LessonInput): Promise<ApiLesson> {
    return firstValueFrom(
      this.http.post<ApiLesson>(this.url(`modules/${moduleId}/lessons`), input),
    );
  }

  updateLesson(lessonId: string, patch: LessonUpdate): Promise<ApiLesson> {
    return firstValueFrom(this.http.patch<ApiLesson>(this.url(`lessons/${lessonId}`), patch));
  }

  /** Refused (409) when learners already have progress on the lesson. */
  async deleteLesson(lessonId: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`lessons/${lessonId}`)));
  }

  /** Persist a new ordering of lessons within one module (ids in the desired order). */
  async reorderLessons(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, order) => this.updateLesson(id, { order })));
  }

  // --- quizzes -------------------------------------------------------------

  quizzes(): Promise<ApiQuiz[]> {
    return firstValueFrom(this.http.get<ApiQuiz[]>(this.url('quizzes')));
  }

  quiz(quizId: string): Promise<ApiQuiz> {
    return firstValueFrom(this.http.get<ApiQuiz>(this.url(`quizzes/${quizId}`)));
  }

  createQuiz(input: QuizInput & { title: string }): Promise<ApiQuiz> {
    return firstValueFrom(this.http.post<ApiQuiz>(this.url('quizzes'), input));
  }

  updateQuiz(quizId: string, patch: QuizInput): Promise<ApiQuiz> {
    return firstValueFrom(this.http.patch<ApiQuiz>(this.url(`quizzes/${quizId}`), patch));
  }

  // --- games ---------------------------------------------------------------

  games(): Promise<ApiGame[]> {
    return firstValueFrom(this.http.get<ApiGame[]>(this.url('games')));
  }

  game(gameId: string): Promise<ApiGame> {
    return firstValueFrom(this.http.get<ApiGame>(this.url(`games/${gameId}`)));
  }

  createGame(input: GameInput & { title: string }): Promise<ApiGame> {
    return firstValueFrom(this.http.post<ApiGame>(this.url('games'), input));
  }

  updateGame(gameId: string, patch: GameInput): Promise<ApiGame> {
    return firstValueFrom(this.http.patch<ApiGame>(this.url(`games/${gameId}`), patch));
  }

  /** Refused (409) while a lesson still uses the game. */
  async deleteGame(gameId: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(`games/${gameId}`)));
  }

  // --- assets --------------------------------------------------------------

  /** Multipart upload; store the returned `assetRef` on a lesson. */
  uploadAsset(file: Blob, fileName: string): Promise<UploadedAsset> {
    const body = new FormData();
    body.append('file', file, fileName);
    return firstValueFrom(this.http.post<UploadedAsset>(this.url('assets'), body));
  }

  /** A short-lived URL for previewing an uploaded asset. */
  assetUrl(assetId: string): Promise<{ url: string; expiresIn: number }> {
    return firstValueFrom(
      this.http.get<{ url: string; expiresIn: number }>(this.url(`assets/${assetId}/url`)),
    );
  }
}
