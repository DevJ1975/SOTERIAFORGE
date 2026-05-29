import { z } from 'zod';
import { auditable, docId, isoDateTime, uid } from './primitives';

/** /b2c/catalog/{productId} — a purchasable module or course. */
export const catalogProduct = auditable.extend({
  id: docId,
  title: z.string().min(1).max(300),
  description: z.string().max(5000).default(''),
  /** What entitlement this product grants (courseId or moduleId). */
  grants: z.object({
    kind: z.enum(['course', 'module', 'all_access']),
    refId: docId.optional(),
  }),
  stripePriceId: z.string().min(1),
  mode: z.enum(['payment', 'subscription']),
  previewUrl: z.string().url().optional(),
  published: z.boolean().default(false),
});
export type CatalogProduct = z.infer<typeof catalogProduct>;

/** /b2c/customers/{uid} */
export const b2cCustomer = auditable.extend({
  uid,
  stripeCustomerId: z.string().optional(),
  /** productIds the customer is entitled to (mirrored to custom claims). */
  entitlements: z.array(docId).default([]),
  purchaseHistory: z
    .array(
      z.object({
        productId: docId,
        stripeEventId: z.string(),
        at: isoDateTime,
        amount: z.number().int().optional(),
        currency: z.string().optional(),
      }),
    )
    .default([]),
});
export type B2cCustomer = z.infer<typeof b2cCustomer>;

/** /stripe/events/{eventId} — webhook idempotency log. */
export const stripeEventLog = z.object({
  eventId: z.string().min(1),
  type: z.string(),
  processedAt: isoDateTime,
});
export type StripeEventLog = z.infer<typeof stripeEventLog>;
