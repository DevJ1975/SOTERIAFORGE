import { z } from 'zod';
import { tenant, tenantId as tenantIdSchema } from '@forge/shared';
import { recordAuditEvent } from './audit-log';
import { parseCaller } from './authz';
import { FunctionsDomainError } from './errors';
import { inviteMemberCore } from './invite-member.core';
import type { CorePorts } from './ports';

const provisionTenantInput = z.object({
  id: tenantIdSchema,
  name: z.string().min(1).max(200),
  plan: z.string().optional(),
  adminEmail: z.string().email().optional(),
});
export type ProvisionTenantInput = z.infer<typeof provisionTenantInput>;

export interface ProvisionTenantResult {
  id: string;
  gcipTenantId: string | null;
  adminInvited: boolean;
}

/**
 * Pure core: superadmin-only tenant provisioning. Creates the tenant doc (validated
 * through the shared tenant schema), best-effort creates a GCIP tenant, and
 * optionally invites the first tenant_admin.
 */
export async function provisionTenantCore(
  deps: CorePorts,
  caller: unknown,
  rawInput: unknown,
): Promise<ProvisionTenantResult> {
  const callerClaims = parseCaller(caller);
  if (!callerClaims || callerClaims.role !== 'superadmin') {
    throw new FunctionsDomainError('permission-denied', 'Only superadmin may provision tenants');
  }

  const parsed = provisionTenantInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new FunctionsDomainError(
      'invalid-argument',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const input = parsed.data;

  const existing = await deps.db.getTenant(input.id);
  if (existing) {
    throw new FunctionsDomainError('already-exists', `Tenant '${input.id}' already exists`);
  }

  // Best-effort GCIP tenant creation; tolerate Identity Platform being unavailable.
  let gcipTenantId: string | null = null;
  if (deps.auth.createGcipTenant) {
    try {
      const created = await deps.auth.createGcipTenant(input.name);
      gcipTenantId = created?.tenantId ?? null;
    } catch {
      gcipTenantId = null;
    }
  }

  const tenantDoc = tenant.parse({
    id: input.id,
    name: input.name,
    status: 'active',
    plan: input.plan ?? 'starter',
    branding: { colors: {} },
    ...(gcipTenantId ? { gcipTenantId } : {}),
    createdAt: new Date().toISOString(),
    ...(callerClaims.uid ? { createdBy: callerClaims.uid } : {}),
  });
  await deps.db.setTenant(input.id, tenantDoc);

  // Best-effort, non-fatal audit trail of the tenant creation. (The optional
  // first-admin invite is audited separately inside inviteMemberCore.)
  await recordAuditEvent(deps.audit, {
    actorUid: callerClaims.uid,
    actorRole: callerClaims.role,
    tenantId: input.id,
    action: 'provisionTenant',
    target: input.id,
    metadata: { name: input.name, plan: tenantDoc.plan, gcipTenantId },
  });

  let adminInvited = false;
  if (input.adminEmail) {
    await inviteMemberCore(deps, caller, {
      email: input.adminEmail,
      role: 'tenant_admin',
      tenantId: input.id,
    });
    adminInvited = true;
  }

  return { id: input.id, gcipTenantId, adminInvited };
}
