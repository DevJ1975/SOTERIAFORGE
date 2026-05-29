import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { QuizGrade, QuizResponse } from '@forge/shared';

export interface QuizSubmitInput {
  tenantId: string;
  courseId: string;
  moduleId: string;
  quizId: string;
  responses: QuizResponse[];
}

/**
 * Submits a quiz attempt to the server-authoritative `submitQuiz` Cloud Function
 * and returns the graded result. The server is the source of truth for all quiz
 * scoring (anti-cheat); this service is purely a typed transport layer.
 */
@Injectable({ providedIn: 'root' })
export class QuizSubmissionService {
  private readonly fns = inject(Functions);

  /**
   * Submit quiz responses to the server and receive back a {@link QuizGrade}.
   *
   * @param input - Scoped submission payload including tenantId, courseId,
   *                moduleId, quizId and the learner's responses.
   * @returns The authoritative server grade.
   */
  submit(input: QuizSubmitInput): Promise<QuizGrade> {
    return httpsCallable<QuizSubmitInput, QuizGrade>(
      this.fns,
      'submitQuiz',
    )(input).then((r) => r.data);
  }
}
