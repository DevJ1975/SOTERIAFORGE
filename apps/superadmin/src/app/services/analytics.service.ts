import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

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
  private readonly fns = inject(Functions);

  load(): Promise<PlatformAnalytics> {
    return httpsCallable<void, PlatformAnalytics>(this.fns, 'platformAnalytics')().then(
      (r) => r.data,
    );
  }
}
