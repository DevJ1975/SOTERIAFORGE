import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom } from 'rxjs';

/*
 * Forge API gamification endpoints (backend/apps/gamification). XP, levels, streaks and
 * crew standings are computed on the server from an append-only XP ledger; the client
 * only displays them.
 */

export type CrewBoardPeriod = 'daily' | 'weekly' | 'allTime';

/** `GET /api/me/progress`: the learner's private score card. */
export interface ApiScoreCard {
  totalXp: number;
  todayXp: number;
  level: number;
  xpIntoLevel: number;
  /** XP cost of the whole current level, so `xpIntoLevel / xpToNext` fills the bar. */
  xpToNext: number;
  streakDays: number;
  /** The last 14 UTC days, oldest first; the last entry is today. */
  strip: boolean[];
  crew: {
    id: string;
    name: string;
    isLead: boolean;
    rank: number | null;
    score: number;
    cohort: string;
  } | null;
}

/** A crew's standing. Crews are ranked; individual learners never are. */
export interface ApiCrewRow {
  rank: number;
  crewId: string;
  name: string;
  /** Average XP per crew member for the period. */
  score: number;
  totalXp: number;
  memberCount: number;
  mine: boolean;
}

export interface ApiCrewBoard {
  period: CrewBoardPeriod;
  scoring: string;
  cohort: { id: string; name: string } | null;
  crews: ApiCrewRow[];
}

@Injectable({ providedIn: 'root' })
export class GamificationApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  progress(): Promise<ApiScoreCard> {
    return firstValueFrom(this.http.get<ApiScoreCard>(this.url('me/progress')));
  }

  /** Staff may pass `cohortId` to view another cohort; learners always see their own. */
  crewBoard(period: CrewBoardPeriod = 'weekly', cohortId?: string): Promise<ApiCrewBoard> {
    return firstValueFrom(
      this.http.get<ApiCrewBoard>(this.url('leaderboard/crews'), {
        params: cohortId ? { period, cohort: cohortId } : { period },
      }),
    );
  }
}
