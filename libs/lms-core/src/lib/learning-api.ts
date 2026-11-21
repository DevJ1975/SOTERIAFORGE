import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import type {
  ApiAttemptResult,
  ApiCheckResult,
  ApiCompletion,
  ApiCourse,
  ApiCourseOutline,
  ApiEnrollment,
  ApiLesson,
  ApiMyEnrollment,
} from '@assurance/shared';
import { firstValueFrom } from 'rxjs';

/*
 * Forge API learning endpoints (backend/apps/learning, backend/apps/assessments).
 * Response types come from the zod schemas in @assurance/shared, which a contract test
 * checks against the API's OpenAPI document (backend/openapi.json).
 */

export type {
  ApiAttemptResult,
  ApiAward,
  ApiAwardBadge,
  ApiCheckResult,
  ApiCompletion,
  ApiCourse,
  ApiCourseOutline,
  ApiEnrollment,
  ApiLesson,
  ApiLessonQuiz,
  ApiLessonSummary,
  ApiModuleOutline,
  ApiMyEnrollment,
  ApiQuestion,
  ContentType,
} from '@assurance/shared';

/** One answer: options for choice/matching, `text` for fill-in, `order` for ordering. */
export interface ApiAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
  order?: string[];
}

/** The API's `{"detail": ...}` message when there is one, else `fallback`. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      return body.detail;
    }
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class LearningApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  courses(): Promise<ApiCourse[]> {
    return firstValueFrom(this.http.get<ApiCourse[]>(this.url('courses')));
  }

  course(courseId: string): Promise<ApiCourseOutline> {
    return firstValueFrom(this.http.get<ApiCourseOutline>(this.url(`courses/${courseId}`)));
  }

  /** Idempotent: returns the existing enrollment without resetting progress. */
  enroll(courseId: string): Promise<ApiEnrollment> {
    return firstValueFrom(
      this.http.post<ApiEnrollment>(this.url(`courses/${courseId}/enroll`), {}),
    );
  }

  myEnrollments(): Promise<ApiMyEnrollment[]> {
    return firstValueFrom(this.http.get<ApiMyEnrollment[]>(this.url('enrollments/me')));
  }

  lesson(lessonId: string): Promise<ApiLesson> {
    return firstValueFrom(this.http.get<ApiLesson>(this.url(`lessons/${lessonId}`)));
  }

  complete(lessonId: string, score?: number): Promise<ApiCompletion> {
    return firstValueFrom(
      this.http.post<ApiCompletion>(
        this.url(`lessons/${lessonId}/complete`),
        score === undefined ? {} : { score },
      ),
    );
  }

  check(lessonId: string, answer: ApiAnswer): Promise<ApiCheckResult> {
    return firstValueFrom(
      this.http.post<ApiCheckResult>(this.url(`lessons/${lessonId}/check`), answer),
    );
  }

  /** A short-lived signed URL for a tenant asset (a lesson's `asset:<id>` reference). */
  assetUrl(assetId: string): Promise<{ url: string; expiresIn: number }> {
    return firstValueFrom(
      this.http.get<{ url: string; expiresIn: number }>(
        this.url(`assets/${encodeURIComponent(assetId)}/url`),
      ),
    );
  }

  /**
   * `idempotencyKey` makes a resend of the same submission safe: the server returns the
   * original result instead of spending another attempt.
   */
  submitQuiz(
    lessonId: string,
    responses: ApiAnswer[],
    idempotencyKey?: string,
  ): Promise<ApiAttemptResult> {
    return firstValueFrom(
      this.http.post<ApiAttemptResult>(
        this.url(`lessons/${lessonId}/attempts`),
        { responses },
        idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {},
      ),
    );
  }
}
