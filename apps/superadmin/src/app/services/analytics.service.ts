import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom } from 'rxjs';

export interface TenantAnalyticsRow {
  tenantId: string;
  name: string;
  status: string;
  plan: string;
  members: number;
  enrollments: number;
  completions: number;
}

export interface PlatformAnalytics {
  totals: {
    tenants: number;
    members: number;
    enrollments: number;
    completions: number;
  };
  tenants: TenantAnalyticsRow[];
  generatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  load(): Promise<PlatformAnalytics> {
    if (!this.base) return Promise.reject(new Error('The Forge API is not configured.'));
    return firstValueFrom(
      this.http.get<PlatformAnalytics>(forgeApiUrl(this.base, '/api/platform/analytics')),
    );
  }
}
