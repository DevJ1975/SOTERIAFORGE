import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom } from 'rxjs';

/*
 * Forge API learning endpoints (backend/apps/learning, backend/apps/assessments).
 * The shapes mirror the response serializers there; the OpenAPI schema at
 * /api/schema is the contract.
 */

export type ContentType = 'video' | 'scorm' | 'cmi5' | 'quiz' | 'game' | 'unity';

export interface ApiCourse {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  tags: string[];
  availableOffline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEnrollment {
  id: string;
  courseId: string;
  memberId: string;
  assigned: boolean;
  dueAt: string | null;
  progressPct: number;
  completedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface ApiLessonSummary {
  id: string;
  title: string;
  order: number;
  contentType: ContentType;
  estimatedMinutes: number | null;
  frameworkTags: string[];
  hasQuiz: boolean;
  completed: boolean;
}

export interface ApiModuleOutline {
  id: string;
  courseId: string;
  title: string;
  label: string;
  order: number;
  lessons: ApiLessonSummary[];
}

export interface ApiCourseOutline extends ApiCourse {
  modules: ApiModuleOutline[];
  enrollment: ApiEnrollment | null;
}

export interface ApiQuestion {
  id: string;
  type: 'mcq' | 'multi_select' | 'true_false' | 'ordering' | 'matching' | 'fill_in';
  prompt: string;
  points: number;
  options: { id: string; text: string }[];
}

export interface ApiLessonQuiz {
  id: string;
  title: string;
  /** `check`: one question at a time, first try recorded. `graded`: submit all at once. */
  mode: 'check' | 'graded';
  passThreshold: number;
  maxAttempts: number | null;
  questions: ApiQuestion[];
  answered: Record<string, { firstCorrect: boolean; solved: boolean }>;
}

export interface ApiLesson {
  id: string;
  courseId: string;
  moduleId: string;
  moduleTitle: string;
  moduleLabel: string;
  title: string;
  order: number;
  contentType: ContentType;
  assetRef: string;
  externalUrl: string;
  scormVersion: string;
  estimatedMinutes: number | null;
  frameworkTags: string[];
  keyPoints: { title: string; body: string }[];
  quiz: ApiLessonQuiz | null;
  progress: { completedAt: string | null; score: number | null; runtime: object } | null;
}

export interface ApiMyEnrollment extends ApiEnrollment {
  course: { id: string; title: string };
  nextLesson: {
    id: string;
    title: string;
    moduleTitle: string;
    moduleLabel: string;
    estimatedMinutes: number | null;
  } | null;
}

export interface ApiCompletion {
  progressPct: number;
  completed: boolean;
  firstCompletion: boolean;
}

/** One answer: options for choice/matching, `text` for fill-in, `order` for ordering. */
export interface ApiAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
  order?: string[];
}

export interface ApiCheckResult {
  questionId: string;
  correct: boolean;
  firstTry: boolean;
  solved: boolean;
  feedback: string | null;
  completion: ApiCompletion | null;
}

export interface ApiAttemptResult {
  earnedPoints: number;
  totalPoints: number;
  scorePct: number;
  passed: boolean;
  perQuestion: { questionId: string; correct: boolean; awardedPoints: number }[];
  attemptsUsed: number;
  attemptsRemaining: number | null;
  completion: ApiCompletion | null;
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

  submitQuiz(lessonId: string, responses: ApiAnswer[]): Promise<ApiAttemptResult> {
    return firstValueFrom(
      this.http.post<ApiAttemptResult>(this.url(`lessons/${lessonId}/attempts`), { responses }),
    );
  }
}
