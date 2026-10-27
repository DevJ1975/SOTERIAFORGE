import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { CoachApi, type CoachAgentId } from './coach-api';

export interface IngestInput {
  sourceId: string;
  courseId: string;
  label: string;
  text?: string;
  file?: File;
  approved: boolean;
  agent?: CoachAgentId;
  referenceUrl?: string;
  edition?: string;
}

export interface IngestResult {
  ok: boolean;
  chunks: number;
}

@Injectable({ providedIn: 'root' })
export class IngestService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(CoachApi);

  async ingest(input: IngestInput): Promise<IngestResult> {
    const body = new FormData();
    body.set('courseId', input.courseId);
    body.set('label', input.label);
    body.set('approved', String(input.approved));
    body.set('agent', input.agent ?? 'general');
    body.set('referenceUrl', input.referenceUrl ?? '');
    body.set('edition', input.edition ?? '');
    if (input.file) body.set('file', input.file);
    else if (input.text !== undefined) body.set('text', input.text);
    return firstValueFrom(
      this.http
        .put<IngestResult>(this.api.url(`sources/${input.sourceId}`), body)
        .pipe(timeout(120_000)),
    );
  }
}
