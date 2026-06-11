import { inject, Injectable } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import type { MemberStatus, Role } from '@forge/shared';

/* ------------------------------------------------------------------------ *
 * Callable input/output shapes — keep in sync with the Phase 1 Cloud
 * Function cores under apps/functions/src/lib/ (*.core.ts).
 * ------------------------------------------------------------------------ */

/** Input for the `setUserRole` callable. `tenantId` is required for all non-superadmin roles. */
export interface SetUserRoleRequest {
  uid: string;
  role: Role;
  tenantId?: string;
}

export interface SetUserRoleResponse {
  uid: string;
  role: Role;
  tenantId?: string;
}

/** Input for the `inviteMember` callable (tenant-scoped roles only). */
export interface InviteMemberRequest {
  email: string;
  role: Role;
  tenantId: string;
  displayName?: string;
}

export interface InviteMemberResponse {
  uid: string;
  status: Extract<MemberStatus, 'invited'>;
}

/** Input for the `provisionTenant` callable (superadmin only). */
export interface ProvisionTenantRequest {
  id: string;
  name: string;
  plan?: string;
  adminEmail?: string;
}

export interface ProvisionTenantResponse {
  id: string;
  gcipTenantId: string | null;
  adminInvited: boolean;
}

/* ------------------------------------------------------------------------ *
 * Error mapping
 * ------------------------------------------------------------------------ */

/** Friendly copy for the HttpsError codes the Forge callables can raise. */
const FRIENDLY_BY_CODE: Readonly<Record<string, string>> = {
  'permission-denied': 'You do not have permission to perform this action.',
  unauthenticated: 'You must be signed in to do that — please sign in and try again.',
  'invalid-argument': 'Some of the submitted values were invalid. Check the form and try again.',
  'not-found': 'The requested record could not be found.',
  'already-exists': 'A record with that identifier already exists.',
  unavailable:
    'The service is unreachable. If you are developing locally, are the Firebase emulators running?',
  'deadline-exceeded': 'The request timed out. Please try again.',
  'resource-exhausted': 'Too many requests — wait a moment and try again.',
  internal: 'Something went wrong on the server. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

function extractCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const raw = String((err as { code: unknown }).code);
  // firebase/functions reports codes as 'functions/<code>'.
  return raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw;
}

/**
 * Maps a callable failure (Firebase `HttpsError` or anything else) onto an
 * `Error` carrying user-presentable copy. Pure — safe to unit test without
 * touching Firebase.
 */
export function toFriendlyFunctionsError(err: unknown): Error {
  const code = extractCode(err);
  const friendly = code ? FRIENDLY_BY_CODE[code] : undefined;
  if (friendly) return new Error(friendly);
  if (err instanceof Error && err.message) return new Error(err.message);
  return new Error('Something went wrong. Please try again.');
}

/* ------------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------------ */

/**
 * Typed client for the Forge admin Cloud Functions (`setUserRole`,
 * `inviteMember`, `provisionTenant`). Failures are rethrown as plain `Error`s
 * with friendly messages (see {@link toFriendlyFunctionsError}).
 *
 * `Functions` is injected optionally so the service can be constructed in
 * tests (or apps) without Firebase providers — calls then reject with a
 * descriptive error instead of throwing at construction time.
 */
@Injectable({ providedIn: 'root' })
export class ForgeAdminApi {
  private readonly functions = inject(Functions, { optional: true });

  /** Assign a role (custom claims) to a user. Superadmin or same-tenant tenant_admin only. */
  setUserRole(input: SetUserRoleRequest): Promise<SetUserRoleResponse> {
    return this.call<SetUserRoleRequest, SetUserRoleResponse>('setUserRole', input);
  }

  /** Invite a member into a tenant (creates the auth user if needed). */
  inviteMember(input: InviteMemberRequest): Promise<InviteMemberResponse> {
    return this.call<InviteMemberRequest, InviteMemberResponse>('inviteMember', input);
  }

  /** Provision a new tenant (superadmin only). */
  provisionTenant(input: ProvisionTenantRequest): Promise<ProvisionTenantResponse> {
    return this.call<ProvisionTenantRequest, ProvisionTenantResponse>('provisionTenant', input);
  }

  private async call<I, O>(name: string, data: I): Promise<O> {
    if (!this.functions) {
      throw new Error('Cloud Functions are not available (provideForgeFirebase missing).');
    }
    try {
      const result = await httpsCallable<I, O>(this.functions, name)(data);
      return result.data;
    } catch (err) {
      throw toFriendlyFunctionsError(err);
    }
  }
}
