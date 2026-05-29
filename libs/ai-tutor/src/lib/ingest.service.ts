import { Injectable, InjectionToken, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface IngestInput {
  tenantId: string;
  sourceId: string;
  text: string;
  label?: string;
  moduleId?: string;
}

export interface IngestResult {
  ok: boolean;
  chunks: number;
}

/**
 * Injection token for the Firebase Functions instance used by IngestService.
 * Kept separate from TUTOR_FUNCTIONS so each service can be tested in isolation.
 */
export const INGEST_FUNCTIONS = new InjectionToken<Functions>('INGEST_FUNCTIONS', {
  providedIn: 'root',
  factory: () => inject(Functions),
});

@Injectable({ providedIn: 'root' })
export class IngestService {
  private readonly functions = inject(INGEST_FUNCTIONS);

  ingest(input: IngestInput): Promise<IngestResult> {
    const callable = httpsCallable<IngestInput, IngestResult>(this.functions, 'ingestKnowledge');
    return callable(input).then((result) => result.data);
  }
}
