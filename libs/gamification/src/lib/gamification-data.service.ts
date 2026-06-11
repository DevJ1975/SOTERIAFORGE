import { Injectable, inject, signal, type Signal } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
// onSnapshot/collection come from the root `firebase/firestore` package so the
// types line up with the converter-typed refs from @forge/data-access (which
// uses the same package; @angular/fire re-exports a nested copy with divergent
// types). Same pattern as the admin members page.
import { collection, onSnapshot } from 'firebase/firestore';
import { leaderboardDoc, memberDoc, timestampsToIso } from '@forge/data-access';
import type { Leaderboard, LeaderboardPeriod, Member } from '@forge/shared';
import { awardSchema, type BadgeAward } from './badges';

export type LiveState = 'loading' | 'ready' | 'error';

/**
 * A live Firestore subscription exposed as signals. Callers own the
 * lifecycle: call {@link LiveSnapshot.unsubscribe} when done (typically via
 * `effect(onCleanup)`).
 */
export interface LiveSnapshot<T> {
  /** Latest value; undefined while loading or when the doc does not exist. */
  readonly value: Signal<T | undefined>;
  readonly state: Signal<LiveState>;
  readonly unsubscribe: () => void;
}

/**
 * Live gamification reads for the learner surface: the member doc (xp /
 * level / streak), the member's badge awards, and the per-tenant leaderboard
 * docs. All reads are tenant-scoped and rely on firestore.rules for access
 * control (tenant members may read members + leaderboard; awards are
 * owner-readable).
 */
@Injectable({ providedIn: 'root' })
export class GamificationData {
  private readonly db = inject(Firestore);

  /** Live member doc at /tenants/{tenantId}/members/{uid}. */
  member(tenantId: string, uid: string): LiveSnapshot<Member> {
    const value = signal<Member | undefined>(undefined);
    const state = signal<LiveState>('loading');
    const unsubscribe = onSnapshot(
      memberDoc(this.db, tenantId, uid),
      (snapshot) => {
        try {
          value.set(snapshot.exists() ? snapshot.data() : undefined);
          state.set('ready');
        } catch (error) {
          console.error('[gamification] member doc failed to parse', error);
          state.set('error');
        }
      },
      (error) => {
        console.error('[gamification] member subscription failed', error);
        state.set('error');
      },
    );
    return { value: value.asReadonly(), state: state.asReadonly(), unsubscribe };
  }

  /**
   * Live badge awards at /tenants/{tenantId}/members/{uid}/awards, newest
   * first. There is no @forge/data-access accessor for awards yet (the
   * backend gamification agent owns that collection), so this reads through
   * the generic SDK and zod-parses each doc with the local
   * {@link awardSchema}; documents that fail to parse are skipped, never
   * fatal. NOTE(unify-later): switch to the shared accessor/schema once both
   * agents land.
   */
  awards(tenantId: string, uid: string): LiveSnapshot<BadgeAward[]> {
    const value = signal<BadgeAward[] | undefined>(undefined);
    const state = signal<LiveState>('loading');
    const awardsCol = collection(this.db, 'tenants', tenantId, 'members', uid, 'awards');
    const unsubscribe = onSnapshot(
      awardsCol,
      (snapshot) => {
        const parsed: BadgeAward[] = [];
        for (const docSnapshot of snapshot.docs) {
          const result = awardSchema.safeParse(timestampsToIso(docSnapshot.data()));
          if (result.success) parsed.push(result.data);
          else console.warn(`[gamification] skipping malformed award ${docSnapshot.ref.path}`);
        }
        parsed.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
        value.set(parsed);
        state.set('ready');
      },
      (error) => {
        console.error('[gamification] awards subscription failed', error);
        state.set('error');
      },
    );
    return { value: value.asReadonly(), state: state.asReadonly(), unsubscribe };
  }

  /**
   * Live leaderboard doc at /tenants/{tenantId}/leaderboard/{period}.
   * `value` stays undefined (with state 'ready') until the scheduled
   * rebuild has materialized the doc — callers render an empty state.
   */
  leaderboard(tenantId: string, period: LeaderboardPeriod): LiveSnapshot<Leaderboard> {
    const value = signal<Leaderboard | undefined>(undefined);
    const state = signal<LiveState>('loading');
    const unsubscribe = onSnapshot(
      leaderboardDoc(this.db, tenantId, period),
      (snapshot) => {
        try {
          value.set(snapshot.exists() ? snapshot.data() : undefined);
          state.set('ready');
        } catch (error) {
          console.error('[gamification] leaderboard doc failed to parse', error);
          state.set('error');
        }
      },
      (error) => {
        console.error('[gamification] leaderboard subscription failed', error);
        state.set('error');
      },
    );
    return { value: value.asReadonly(), state: state.asReadonly(), unsubscribe };
  }
}
