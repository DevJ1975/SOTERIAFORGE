import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom } from 'rxjs';

/*
 * Forge API staff endpoints for cohorts, crews and badges (backend/apps/gamification).
 * Tenant staff only (tenant_admin or instructor); the server enforces roles and scopes
 * everything to the acting tenant.
 */

export interface ApiCohort {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
}

export interface NewCohortInput {
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface ApiCrewMember {
  id: string;
  displayName: string;
  isLead: boolean;
}

export interface ApiCrewNode {
  id: string;
  name: string;
  members: ApiCrewMember[];
}

export interface ApiSectionNode {
  id: string;
  name: string;
  crews: ApiCrewNode[];
}

/** `GET /api/cohorts/{id}`: the cohort with its sections, crews and rosters. */
export interface ApiCohortTree extends ApiCohort {
  sections: ApiSectionNode[];
}

export interface ApiNamed {
  id: string;
  name: string;
}

export type BadgeKind = 'mission' | 'credential';

export type BadgeRule =
  | 'lessons_completed'
  | 'course_completed'
  | 'quizzes_passed'
  | 'streak_days'
  | 'level'
  | 'xp_total'
  | 'manual';

export interface ApiBadgeDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  kind: BadgeKind;
  rule: BadgeRule;
  target: number;
  order: number;
  active: boolean;
}

/** Editable badge fields. Credentials must use the `manual` rule. */
export type BadgeInput = Omit<ApiBadgeDefinition, 'id'>;

/**
 * The API's `detail`, its field validation errors, or a bare list of messages (what a
 * plain `ValidationError("...")` returns), else `fallback`.
 */
export function gamificationAdminErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  const body: unknown = error.error;
  if (typeof body === 'string' && error.status === 400 && body && body.length < 300) return body;
  if (Array.isArray(body)) {
    const text = body.filter((v): v is string => typeof v === 'string').join(' ');
    return text || fallback;
  }
  if (body && typeof body === 'object') {
    if ('detail' in body && typeof body.detail === 'string') return body.detail;
    const parts: string[] = [];
    for (const [field, value] of Object.entries(body)) {
      const first: unknown = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') {
        parts.push(field === 'non_field_errors' ? first : `${field}: ${first}`);
      }
    }
    if (parts.length) return parts.join('; ');
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class GamificationAdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  // --- cohorts, sections and crews ----------------------------------------

  cohorts(): Promise<ApiCohort[]> {
    return firstValueFrom(this.http.get<ApiCohort[]>(this.url('cohorts')));
  }

  createCohort(input: NewCohortInput): Promise<ApiCohort> {
    return firstValueFrom(this.http.post<ApiCohort>(this.url('cohorts'), input));
  }

  cohort(cohortId: string): Promise<ApiCohortTree> {
    return firstValueFrom(this.http.get<ApiCohortTree>(this.url(`cohorts/${cohortId}`)));
  }

  createSection(cohortId: string, name: string): Promise<ApiNamed> {
    return firstValueFrom(
      this.http.post<ApiNamed>(this.url(`cohorts/${cohortId}/sections`), { name }),
    );
  }

  createCrew(sectionId: string, name: string): Promise<ApiNamed> {
    return firstValueFrom(
      this.http.post<ApiNamed>(this.url(`sections/${sectionId}/crews`), { name }),
    );
  }

  /**
   * Replaces the crew roster. Learners move out of any other crew in the same cohort.
   * `leadIds` (a subset of `memberIds`) keeps crew leads; leave it out and nobody leads.
   */
  setCrewMembers(crewId: string, memberIds: string[], leadIds?: string[]): Promise<ApiNamed> {
    return firstValueFrom(
      this.http.put<ApiNamed>(this.url(`crews/${crewId}/members`), {
        memberIds,
        ...(leadIds ? { leadIds } : {}),
      }),
    );
  }

  // --- badges --------------------------------------------------------------

  badges(): Promise<ApiBadgeDefinition[]> {
    return firstValueFrom(this.http.get<ApiBadgeDefinition[]>(this.url('badges')));
  }

  createBadge(input: BadgeInput): Promise<ApiBadgeDefinition> {
    return firstValueFrom(this.http.post<ApiBadgeDefinition>(this.url('badges'), input));
  }

  updateBadge(badgeId: string, patch: Partial<BadgeInput>): Promise<ApiBadgeDefinition> {
    return firstValueFrom(
      this.http.patch<ApiBadgeDefinition>(this.url(`badges/${badgeId}`), patch),
    );
  }

  /** Fails with 400 when members already hold the badge: retire it instead. */
  deleteBadge(badgeId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.url(`badges/${badgeId}`)));
  }

  /** Instructor sign-off: the only way to earn a credential. Idempotent. */
  awardBadge(badgeId: string, memberId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(this.url(`badges/${badgeId}/award`), { memberId }));
  }
}
