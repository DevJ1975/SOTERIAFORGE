import { z } from 'zod';
import {
  customClaims,
  member,
  TENANT_SCOPED_ROLES,
  tenantId as tenantIdSchema,
  type MemberStatus,
  type Role,
} from '@forge/shared';
import { recordAuditEvent } from './audit-log';
import { canManageRole, parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { CorePorts } from './ports';

const inviteMemberInput = z.object({
  email: z.string().email(),
  role: z.enum(TENANT_SCOPED_ROLES as [Role, ...Role[]]),
  tenantId: tenantIdSchema,
  displayName: z.string().max(200).optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInput>;

export interface InviteMemberResult {
  uid: string;
  status: Extract<MemberStatus, 'invited'>;
}

/**
 * Pure core: invite a user into a tenant. Reuses an existing auth user by email
 * or creates one, sets custom claims, and upserts the member doc with status 'invited'.
 */
export async function inviteMemberCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
): Promise<InviteMemberResult> {
  const parsed = inviteMemberInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;

  const callerClaims = parseCaller(caller);
  const decision = canManageRole(callerClaims, {
    targetRole: input.role,
    targetTenantId: input.tenantId,
  });
  if (!decision.allowed) {
    throw new FunctionsDomainError('permission-denied', decision.reason ?? 'Not allowed');
  }

  const tenantDoc = await deps.db.getTenant(input.tenantId);
  if (!tenantDoc) {
    throw new FunctionsDomainError('not-found', `Tenant '${input.tenantId}' does not exist`);
  }
  const gcipTenantId =
    typeof tenantDoc['gcipTenantId'] === 'string' ? tenantDoc['gcipTenantId'] : undefined;

  const existing = await deps.auth.getUserByEmail(input.email);
  const uid = existing
    ? existing.uid
    : (
        await deps.auth.createUser({
          email: input.email,
          ...(input.displayName ? { displayName: input.displayName } : {}),
        })
      ).uid;

  const claims = customClaims.parse({
    role: input.role,
    tenantId: input.tenantId,
    entitlements: [],
    ...(gcipTenantId ? { gcipTenantId } : {}),
  });
  await deps.auth.setCustomClaims(uid, claims);

  const memberDoc = member.parse({
    uid,
    tenantId: input.tenantId,
    role: input.role,
    status: 'invited',
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    xp: 0,
    level: 1,
    streakDays: 0,
    createdAt: new Date().toISOString(),
    ...(callerClaims?.uid ? { createdBy: callerClaims.uid } : {}),
  });
  await deps.db.setMember(input.tenantId, uid, memberDoc);

  // Best-effort, non-fatal audit trail of the invitation.
  await recordAuditEvent(deps.audit, {
    actorUid: callerClaims?.uid,
    actorRole: callerClaims?.role,
    tenantId: input.tenantId,
    action: 'inviteMember',
    target: uid,
    metadata: { role: input.role, email: input.email, reusedExistingUser: !!existing },
  });

  return { uid, status: 'invited' };
}
