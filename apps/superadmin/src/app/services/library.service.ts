import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface ShareLibraryCourseInput {
  libraryCourseId: string;
  tenantIds: string[];
}

export interface ShareLibraryCourseResult {
  ok: boolean;
  created: number;
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly fns = inject(Functions);

  share(input: ShareLibraryCourseInput): Promise<ShareLibraryCourseResult> {
    return httpsCallable<ShareLibraryCourseInput, ShareLibraryCourseResult>(
      this.fns,
      'shareLibraryCourse',
    )(input).then((r) => r.data);
  }
}
