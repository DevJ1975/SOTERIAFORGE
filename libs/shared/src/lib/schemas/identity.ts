import { z } from 'zod';
import { ROLES } from '../constants';
import { tenantId, uid } from './primitives';

/**
 * Custom-claims shape. Issued ONLY by the Forge API (never the client).
 * Superadmin carries no single tenantId binding.
 */
export const customClaims = z
  .object({
    role: z.enum(ROLES),
    /** Required for tenant-scoped roles; absent for superadmin. */
    tenantId: tenantId.optional(),
    /** B2C entitlements (productIds) granted by the Forge API. */
    entitlements: z.array(z.string()).default([]),
  })
  .refine((c) => c.role === 'superadmin' || !!c.tenantId, {
    message: 'tenantId is required for all non-superadmin roles',
    path: ['tenantId'],
  });
export type CustomClaims = z.infer<typeof customClaims>;

/** A resolved authenticated principal as used across the apps. */
export const principal = z.object({
  uid,
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  claims: customClaims,
});
export type Principal = z.infer<typeof principal>;
