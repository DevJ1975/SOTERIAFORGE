import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { Branding, Role, TenantStatus } from '@assurance/shared';

export interface ProvisionTenantInput {
  tenantId: string;
  name: string;
  plan?: string;
  adminEmail?: string;
}
export interface InviteMemberInput {
  tenantId: string;
  email: string;
  role: Role;
  displayName?: string;
}

/**
 * Thin, typed client wrappers over the privileged Cloud Functions. All tenant
 * lifecycle / membership / branding mutations are server-authoritative; these
 * just invoke the callables and surface typed results.
 */
@Injectable({ providedIn: 'root' })
export class TenantAdminService {
  private readonly fns = inject(Functions);

  provisionTenant(input: ProvisionTenantInput) {
    return httpsCallable<
      ProvisionTenantInput,
      { ok: boolean; tenantId: string; gcipTenantId: string }
    >(
      this.fns,
      'provisionTenant',
    )(input).then((r) => r.data);
  }

  setTenantStatus(tenantId: string, status: TenantStatus) {
    return httpsCallable<{ tenantId: string; status: TenantStatus }, { ok: boolean }>(
      this.fns,
      'setTenantStatus',
    )({ tenantId, status }).then((r) => r.data);
  }
}

@Injectable({ providedIn: 'root' })
export class MemberAdminService {
  private readonly fns = inject(Functions);

  inviteMember(input: InviteMemberInput) {
    return httpsCallable<InviteMemberInput, { ok: boolean; uid: string; inviteLink: string }>(
      this.fns,
      'inviteMember',
    )(input).then((r) => r.data);
  }

  setMemberRole(tenantId: string, uid: string, role: Role) {
    return httpsCallable<{ tenantId: string; uid: string; role: Role }, { ok: boolean }>(
      this.fns,
      'setMemberRole',
    )({ tenantId, uid, role }).then((r) => r.data);
  }

  deactivateMember(tenantId: string, uid: string) {
    return httpsCallable<{ tenantId: string; uid: string }, { ok: boolean }>(
      this.fns,
      'deactivateMember',
    )({ tenantId, uid }).then((r) => r.data);
  }
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly fns = inject(Functions);

  updateBranding(tenantId: string, branding: Branding) {
    return httpsCallable<{ tenantId: string; branding: Branding }, { ok: boolean }>(
      this.fns,
      'updateBranding',
    )({ tenantId, branding }).then((r) => r.data);
  }
}
