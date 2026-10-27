import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ASSURANCE_ENV, forgeApiUrl } from '@assurance/auth';
import { firstValueFrom } from 'rxjs';

/* Forge API tenant endpoints (backend/apps/tenants/admin_views.py); superadmin only. */

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'archived';

export interface TenantRow {
  id: string;
  name: string;
  status: TenantStatus;
  plan: string;
  customDomain: string;
  createdAt: string;
}

export interface ProvisionTenantInput {
  id: string;
  name: string;
  plan?: string;
  /** Invited as the tenant's first admin when given. */
  adminEmail?: string;
}

@Injectable({ providedIn: 'root' })
export class TenantsService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ASSURANCE_ENV).apiBaseUrl;

  private url(path: string): string {
    if (!this.base) throw new Error('The Forge API is not configured.');
    return forgeApiUrl(this.base, `/api/${path}`);
  }

  list(): Promise<TenantRow[]> {
    return firstValueFrom(this.http.get<TenantRow[]>(this.url('tenants')));
  }

  provision(input: ProvisionTenantInput): Promise<TenantRow> {
    return firstValueFrom(this.http.post<TenantRow>(this.url('tenants'), input));
  }

  /** Suspend, reactivate or archive. */
  setStatus(tenantId: string, status: Exclude<TenantStatus, 'provisioning'>): Promise<TenantRow> {
    return firstValueFrom(this.http.patch<TenantRow>(this.url(`tenants/${tenantId}`), { status }));
  }
}
