import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom, fromEvent, takeUntil, timeout } from 'rxjs';

export interface CoachCourse {
  id: string;
  title: string;
}

export type CoachAgentId = 'general' | 'workplace-ai' | 'cybersecurity-ai';

export interface CoachReference {
  id: string;
  title: string;
  url: string;
  edition: string;
  status: 'pending_instructor_review';
  checkedOn: string;
}

export interface CoachProfile {
  id: CoachAgentId;
  title: string;
  description: string;
  references: CoachReference[];
}

export interface CoachSource {
  id: string;
  courseId: string;
  title: string;
  chunkCount: number;
  updatedAt: string;
  agent: CoachAgentId;
  referenceUrl: string;
  edition: string;
}

export interface TutorAnswer {
  answer: string;
  abstained: boolean;
  citations: {
    sourceId: string;
    chunkId: number;
    label: string;
    courseId: string;
    page: number | null;
  }[];
}

export function coachError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object') {
      if ('detail' in body && typeof body.detail === 'string') return body.detail;
      return `The tutor rejected the request: ${JSON.stringify(body)}`;
    }
    return 'The local tutor API could not be reached.';
  }
  return error instanceof Error ? error.message : 'The local tutor request failed.';
}

@Injectable({ providedIn: 'root' })
export class CoachApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  url(path: string): string {
    if (!this.base) throw new Error('Configure the Forge API URL to use the local tutor.');
    return forgeApiUrl(this.base, `/api/coach/${path}`);
  }

  async courses(): Promise<CoachCourse[]> {
    return firstValueFrom(this.http.get<CoachCourse[]>(this.url('courses')));
  }

  async profiles(): Promise<CoachProfile[]> {
    return firstValueFrom(this.http.get<CoachProfile[]>(this.url('profiles')));
  }

  async sources(): Promise<CoachSource[]> {
    return firstValueFrom(this.http.get<CoachSource[]>(this.url('sources')));
  }

  async remove(sourceId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`sources/${sourceId}`)));
  }

  async ask(
    question: string,
    courseId: string,
    signal?: AbortSignal,
    agent: CoachAgentId = 'general',
  ): Promise<TutorAnswer> {
    const request = this.http
      .post<TutorAnswer>(this.url('ask'), { question, courseId, agent })
      .pipe(timeout(120_000));
    return firstValueFrom(signal ? request.pipe(takeUntil(fromEvent(signal, 'abort'))) : request);
  }
}
