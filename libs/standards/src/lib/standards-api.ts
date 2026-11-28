import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom, timeout } from 'rxjs';
import type { ApiCompletion } from '@assurance/lms-core';

export interface StandardsPackage {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'ready' | 'failed' | 'archived';
  sha256: string;
  scorm_version: '' | '1.2' | '2004';
  error: string;
  created_at: string;
}

export type StandardsCompletion = ApiCompletion;

export interface StandardsLaunch {
  id: string;
  url: string;
  origin: string;
  expiresAt: string;
}

/** cmi5 launch parameters for a `cmi5` or `unity` lesson (docs/unity-cmi5-contract.md). */
export interface AuLaunch {
  id: string;
  auUrl: string;
  endpoint: string;
  fetch: string;
  /** JSON-serialised xAPI Agent. */
  actor: string;
  registration: string;
  activityId: string;
  expiresAt: string;
}

/** What the launched content has reported so far. */
export interface AuSession {
  id: string;
  active: boolean;
  initialized: boolean;
  completed: boolean;
  success: boolean | null;
  terminated: boolean;
  score: number | null;
  completion: StandardsCompletion | null;
}

export interface StandardsCommit {
  sequence: number;
  cmi: Record<string, unknown>;
}

export interface StandardsDelivery {
  id: string;
  attempts: number;
  next_attempt_at: string;
  delivered_at: string | null;
  last_error: string;
}

export interface StandardsConfiguration {
  enabled: boolean;
  storageConfigured: boolean;
  contentOriginConfigured: boolean;
  xapiRecordingEnabled: boolean;
  lrsConfigured: boolean;
}

export type DispatchFormat = 'scorm12' | 'cmi5';

/** A course exported as a thin package another LMS imports (backend `Dispatch`). */
export interface StandardsDispatch {
  id: string;
  courseId: string;
  courseTitle: string;
  format: DispatchFormat;
  /** Origins the LMS serves the package from; the learner app reports only to these. */
  lmsOrigins: string[];
  revoked: boolean;
  createdAt: string;
  launchUrl: string;
}

export interface NewDispatchInput {
  courseId: string;
  format: DispatchFormat;
  lmsOrigins: string[];
}

/** The signed-in learner's standing in a dispatched course. */
export interface DispatchSession {
  dispatchId: string;
  courseId: string;
  courseTitle: string;
  format: DispatchFormat;
  lmsOrigins: string[];
  enrolled: boolean;
  progressPct: number;
  completed: boolean;
  completedAt: string | null;
  scorePct: number | null;
}

export interface DispatchPackageFile {
  blob: Blob;
  filename: string;
}

/** The filename in a `Content-Disposition: attachment` header, if it has a safe one. */
export function attachmentFilename(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  let name = plain?.[1] ?? null;
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // keep the plain filename
    }
  }
  name = name?.trim().replace(/[\\/]/g, '_') ?? null;
  return name || null;
}

@Injectable({ providedIn: 'root' })
export class StandardsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/standards/${path}`);
  }

  packages(): Promise<StandardsPackage[]> {
    return firstValueFrom(this.http.get<StandardsPackage[]>(this.url('packages')));
  }

  upload(title: string, file: File): Promise<StandardsPackage> {
    const body = new FormData();
    body.append('title', title);
    body.append('file', file);
    return firstValueFrom(
      this.http.post<StandardsPackage>(this.url('packages'), body).pipe(timeout(120_000)),
    );
  }

  attach(packageId: string, moduleId: string, title: string): Promise<{ lessonId: string }> {
    return firstValueFrom(
      this.http.post<{ lessonId: string }>(this.url(`packages/${packageId}/attach`), {
        moduleId,
        title,
      }),
    );
  }

  archive(packageId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`packages/${packageId}`)));
  }

  launch(lessonId: string): Promise<StandardsLaunch> {
    return firstValueFrom(
      this.http
        .post<StandardsLaunch>(this.url(`lessons/${lessonId}/launch`), {})
        .pipe(timeout(30_000)),
    );
  }

  commit(
    launchId: string,
    body: StandardsCommit,
  ): Promise<{ sequence: number; completion: StandardsCompletion | null }> {
    return firstValueFrom(
      this.http
        .post<{
          sequence: number;
          completion: StandardsCompletion | null;
        }>(this.url(`launches/${launchId}/commit`), body)
        .pipe(timeout(30_000)),
    );
  }

  cmi5Launch(lessonId: string): Promise<AuLaunch> {
    return firstValueFrom(
      this.http
        .post<AuLaunch>(this.url(`lessons/${lessonId}/cmi5/launch`), {})
        .pipe(timeout(30_000)),
    );
  }

  cmi5Session(sessionId: string): Promise<AuSession> {
    return firstValueFrom(
      this.http.get<AuSession>(this.url(`cmi5/sessions/${sessionId}`)).pipe(timeout(15_000)),
    );
  }

  deliveries(): Promise<StandardsDelivery[]> {
    return firstValueFrom(this.http.get<StandardsDelivery[]>(this.url('deliveries')));
  }

  configuration(): Promise<StandardsConfiguration> {
    return firstValueFrom(this.http.get<StandardsConfiguration>(this.url('configuration')));
  }

  // --- LMS export packages ("dispatches") ---------------------------------

  dispatches(): Promise<StandardsDispatch[]> {
    return firstValueFrom(this.http.get<StandardsDispatch[]>(this.url('dispatches')));
  }

  createDispatch(input: NewDispatchInput): Promise<StandardsDispatch> {
    return firstValueFrom(this.http.post<StandardsDispatch>(this.url('dispatches'), input));
  }

  updateDispatch(
    dispatchId: string,
    changes: { lmsOrigins?: string[]; revoked?: boolean },
  ): Promise<StandardsDispatch> {
    return firstValueFrom(
      this.http.patch<StandardsDispatch>(this.url(`dispatches/${dispatchId}`), changes),
    );
  }

  async dispatchPackage(dispatch: {
    id: string;
    format: DispatchFormat;
  }): Promise<DispatchPackageFile> {
    const response = await firstValueFrom(
      this.http
        .get(this.url(`dispatches/${dispatch.id}/package`), {
          observe: 'response',
          responseType: 'blob',
        })
        .pipe(timeout(60_000)),
    );
    return {
      blob: response.body ?? new Blob([], { type: 'application/zip' }),
      filename:
        attachmentFilename(response.headers.get('Content-Disposition')) ??
        `forge-${dispatch.format}.zip`,
    };
  }

  dispatchSession(dispatchId: string): Promise<DispatchSession> {
    return firstValueFrom(
      this.http
        .get<DispatchSession>(this.url(`dispatches/${dispatchId}/session`))
        .pipe(timeout(15_000)),
    );
  }
}
