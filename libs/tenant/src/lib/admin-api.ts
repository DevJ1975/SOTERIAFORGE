import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import type { Branding, Role, TenantStatus } from '@assurance/shared';
import { firstValueFrom } from 'rxjs';

/*
 * Tenant administration against the Forge API (backend/apps/accounts/admin_views.py and
 * backend/apps/tenants/admin_views.py). The server decides who may do what; these are
 * thin, typed calls. Members are addressed by `member.id`.
 */

/**
 * The API's `{"detail": ...}` message, else the first field error of a 400
 * (`{"logoUrl": ["Use an https:// URL."]}`), else `fallback`.
 */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object') {
      if ('detail' in body && typeof body.detail === 'string') return body.detail;
      for (const [field, value] of Object.entries(body)) {
        const first: unknown = Array.isArray(value) ? value[0] : value;
        if (typeof first === 'string') {
          return field === 'non_field_errors' ? first : `${field}: ${first}`;
        }
      }
    }
  }
  return fallback;
}

export type MemberStatus = 'invited' | 'active' | 'deactivated';

/** A member as the API returns it. `uid` is only a legacy alias of `id`. */
export interface ApiMember {
  id: string;
  uid: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: Role;
  status: MemberStatus;
}

export interface ProvisionTenantInput {
  tenantId: string;
  name: string;
  plan?: string;
  adminEmail?: string;
}
export interface InviteMemberInput {
  email: string;
  role: Role;
  displayName?: string;
}
export interface InviteMemberResult {
  member: ApiMember;
  inviteLink: string;
}

/** Tenant lifecycle (superadmin). */
@Injectable({ providedIn: 'root' })
export class TenantAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  async provisionTenant(input: ProvisionTenantInput): Promise<{ ok: boolean; tenantId: string }> {
    const { tenantId, ...rest } = input;
    await firstValueFrom(this.http.post(this.url('tenants'), { id: tenantId, ...rest }));
    return { ok: true, tenantId };
  }

  async setTenantStatus(tenantId: string, status: TenantStatus): Promise<{ ok: boolean }> {
    await firstValueFrom(this.http.patch(this.url(`tenants/${tenantId}`), { status }));
    return { ok: true };
  }
}

/** Members of the acting tenant (staff reads; tenant admins write). */
@Injectable({ providedIn: 'root' })
export class MemberAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  listMembers(): Promise<ApiMember[]> {
    return firstValueFrom(this.http.get<ApiMember[]>(this.url('members')));
  }

  inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
    return firstValueFrom(this.http.post<InviteMemberResult>(this.url('members/invite'), input));
  }

  setMemberRole(memberId: string, role: Role): Promise<ApiMember> {
    return firstValueFrom(
      this.http.patch<ApiMember>(this.url(`members/${memberId}/role`), { role }),
    );
  }

  setMemberStatus(memberId: string, status: 'active' | 'deactivated'): Promise<ApiMember> {
    return firstValueFrom(
      this.http.patch<ApiMember>(this.url(`members/${memberId}/status`), { status }),
    );
  }

  deactivateMember(memberId: string): Promise<ApiMember> {
    return this.setMemberStatus(memberId, 'deactivated');
  }

  reactivateMember(memberId: string): Promise<ApiMember> {
    return this.setMemberStatus(memberId, 'active');
  }

  /** Everything Forge holds about one member (data portability). */
  exportMember(memberId: string): Promise<unknown> {
    return firstValueFrom(this.http.get<unknown>(this.url(`members/${memberId}/export`)));
  }
}

/** One row of `GET /api/reports/enrollments`. */
export interface EnrollmentReportRow {
  memberId: string;
  memberName: string;
  email: string;
  courseId: string;
  courseTitle: string;
  progressPct: number;
  completedAt: string | null;
  dueAt: string | null;
  lastActivityAt: string | null;
}

/** Optional scope for the staff analytics endpoints. */
export interface ReportScope {
  courseId?: string | null;
  cohortId?: string | null;
}

export interface AnalyticsTotals {
  learners: number;
  activeLast7Days: number;
  enrollments: number;
  completions: number;
  /** 0-100 with one decimal. */
  completionRate: number;
  averageProgressPct: number;
  /** Share of knowledge-check questions answered correctly first try; null with no answers. */
  firstTryPct: number | null;
}

export interface AnalyticsCourseRow {
  courseId: string;
  title: string;
  enrollments: number;
  completions: number;
  averageProgressPct: number;
}

export interface AnalyticsLessonRow {
  lessonId: string;
  title: string;
  moduleTitle: string;
  completions: number;
  enrollments: number;
  firstTryPct: number | null;
}

export interface AnalyticsWeek {
  /** Monday of the week, `YYYY-MM-DD`. */
  weekStart: string;
  activeLearners: number;
  lessonsCompleted: number;
}

export interface TenantAnalytics {
  generatedAt: string;
  totals: AnalyticsTotals;
  courses: AnalyticsCourseRow[];
  /** Empty unless a course is selected. */
  lessons: AnalyticsLessonRow[];
  /** The last eight weeks, oldest first. */
  weeks: AnalyticsWeek[];
}

export type AtRiskReason = 'inactive' | 'overdue' | 'behind' | 'low_scores' | 'missed_sessions';

export interface AtRiskRules {
  inactiveDays: number;
  behindPoints: number;
  firstTryPct: number;
  missedSessions: number;
}

export interface AtRiskLearner {
  memberId: string;
  memberName: string;
  email: string;
  cohortName: string | null;
  crewName: string | null;
  progressPct: number;
  lastActivityAt: string | null;
  firstTryPct: number | null;
  sessionsMissed: number;
  reasons: AtRiskReason[];
}

export interface AtRiskReport {
  generatedAt: string;
  rules: AtRiskRules;
  /** Most at risk first. */
  learners: AtRiskLearner[];
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/reports/${path}`);
  }

  private scope(scope: ReportScope): { params: Record<string, string> } {
    const params: Record<string, string> = {};
    if (scope.courseId) params['courseId'] = scope.courseId;
    if (scope.cohortId) params['cohortId'] = scope.cohortId;
    return { params };
  }

  enrollments(): Promise<EnrollmentReportRow[]> {
    return firstValueFrom(this.http.get<EnrollmentReportRow[]>(this.url('enrollments')));
  }

  analytics(scope: ReportScope = {}): Promise<TenantAnalytics> {
    return firstValueFrom(this.http.get<TenantAnalytics>(this.url('analytics'), this.scope(scope)));
  }

  atRisk(scope: ReportScope = {}): Promise<AtRiskReport> {
    return firstValueFrom(this.http.get<AtRiskReport>(this.url('at-risk'), this.scope(scope)));
  }
}

/** A tenant's branding (own tenant_admin or superadmin writes). */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  /** The acting tenant's current branding (public endpoint; the interceptor adds the tenant). */
  async getBranding(): Promise<Branding | null> {
    const t = await firstValueFrom(
      this.http.get<{ branding?: Branding }>(this.url('tenant/branding')),
    );
    return t.branding && Object.keys(t.branding).length > 0 ? t.branding : null;
  }

  updateBranding(tenantId: string, branding: Branding): Promise<unknown> {
    return firstValueFrom(this.http.put(this.url(`tenants/${tenantId}/branding`), branding));
  }
}
