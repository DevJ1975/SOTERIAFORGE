import { z } from 'zod';
import { customClaims, ROLES, tenantId as tenantIdSchema, type Role } from '@forge/shared';
import { recordAuditEvent } from './audit-log';
import { canManageRole, parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import type { CorePorts } from './ports';

const setUserRoleInput = z
  .object({
    uid: z.string().min(1),
    role: z.enum(ROLES),
    tenantId: tenantIdSchema.optional(),
  })
  .refine((i) => i.role === 'superadmin' || !!i.tenantId, {
    message: 'tenantId is required for all non-superadmin roles',
    path: ['tenantId'],
  });
export type SetUserRoleInput = z.infer<typeof setUserRoleInput>;

export interface SetUserRoleResult {
  uid: string;
  role: Role;
  tenantId?: string;
}

/**
 * Pure core: validate input, authorize the caller, write custom claims (the only
 * place claims are written), and mirror the role onto the member doc when tenant-scoped.
 */
export async function setUserRoleCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
): Promise<SetUserRoleResult> {
  const parsed = setUserRoleInput.safeParse(rawInput);
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

  // Build claims through the shared schema so invariants always hold.
  const claims = customClaims.parse({
    role: input.role,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    entitlements: [],
  });
  await deps.auth.setCustomClaims(input.uid, claims);

  if (input.tenantId) {
    await deps.db.setMember(input.tenantId, input.uid, { role: input.role });
  }

  // Best-effort, non-fatal audit trail of the claim change.
  await recordAuditEvent(deps.audit, {
    actorUid: callerClaims?.uid,
    actorRole: callerClaims?.role,
    tenantId: input.tenantId,
    action: 'setUserRole',
    target: input.uid,
    metadata: { role: input.role },
  });

  return {
    uid: input.uid,
    role: input.role,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  };
}
