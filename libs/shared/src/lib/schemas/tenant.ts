import { z } from 'zod';
import { MEMBER_STATUSES, ROLES, TENANT_STATUSES } from '../constants';
import { auditable, count, storageRef, tenantId, uid } from './primitives';

/** Per-tenant white-label branding. Applied at runtime via CSS custom properties. */
export const branding = z.object({
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  /** Design tokens mapped to CSS custom properties (e.g. "--forge-primary"). */
  colors: z.record(z.string(), z.string()).default({}),
  fontFamily: z.string().optional(),
  emailFromName: z.string().optional(),
});
export type Branding = z.infer<typeof branding>;

/** /tenants/{tenantId} */
export const tenant = auditable.extend({
  id: tenantId,
  name: z.string().min(1).max(200),
  status: z.enum(TENANT_STATUSES),
  plan: z.string().default('starter'),
  /** Custom domain mapped to this tenant, if any (Phase 1+). */
  customDomain: z.string().optional(),
  branding: branding.default({ colors: {} }),
  /** GCIP Identity Platform tenant id. */
  gcipTenantId: z.string().optional(),
});
export type Tenant = z.infer<typeof tenant>;

/** /tenants/{tenantId}/members/{uid} */
export const member = auditable.extend({
  uid,
  tenantId,
  role: z.enum(ROLES),
  status: z.enum(MEMBER_STATUSES),
  email: z.string().email(),
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  /** Gamification denormalized onto the member doc for fast reads. */
  xp: count.default(0),
  level: count.default(1),
  streakDays: count.default(0),
  lastActiveAt: z.string().datetime({ offset: true }).optional(),
  /** Open Badges earned (badgeIds); awarded server-side on completion. */
  earnedBadgeIds: z.array(z.string()).default([]),
  /** Registered FCM device tokens for push notifications. */
  fcmTokens: z.array(z.string()).optional(),
});
export type Member = z.infer<typeof member>;

/** Theme document returned to SSR/edge for white-labeling a host. */
export const tenantTheme = z.object({
  tenantId,
  branding,
  logoStorageRef: storageRef.optional(),
});
export type TenantTheme = z.infer<typeof tenantTheme>;
