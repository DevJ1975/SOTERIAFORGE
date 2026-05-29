import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, getDoc } from '@angular/fire/firestore';
import type { Observable } from 'rxjs';
import type { LeaderboardPeriod, Leaderboard } from '@forge/shared';
import { leaderboard } from '@forge/shared';
import { zodConverter } from '../converters';
import { FsPaths } from '../paths';

/**
 * Read-only repository for the per-tenant leaderboard documents.
 *
 * Firestore path: `tenants/{tenantId}/leaderboard/{period}`
 * Each period is a single document (id = period string).
 *
 * Writes are server-authoritative (Cloud Functions only); clients MUST NOT
 * write leaderboard data directly.
 */
@Injectable({ providedIn: 'root' })
export class LeaderboardRepository {
  private readonly fs = inject(Firestore);

  private converter = zodConverter<Leaderboard>(leaderboard, 'leaderboard');

  private ref(tenantId: string, period: string) {
    return doc(this.fs, FsPaths.leaderboard(tenantId, period)).withConverter(this.converter);
  }

  /**
   * Fetch the leaderboard document for a given tenant and period once.
   * Returns `null` when the document does not exist.
   */
  async get(tenantId: string, period: LeaderboardPeriod): Promise<Leaderboard | null> {
    const snap = await getDoc(this.ref(tenantId, period));
    return snap.exists() ? snap.data() : null;
  }

  /**
   * Subscribe to live updates of the leaderboard document.
   * Emits `undefined` when the document does not exist.
   */
  watch(tenantId: string, period: LeaderboardPeriod): Observable<Leaderboard | undefined> {
    return docData(this.ref(tenantId, period)) as Observable<Leaderboard | undefined>;
  }
}
