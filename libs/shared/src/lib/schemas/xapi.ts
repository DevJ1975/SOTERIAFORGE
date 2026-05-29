import { z } from 'zod';
import { XAPI_VERBS } from '../constants';
import { isoDateTime, tenantId, uid } from './primitives';

/** Minimal xAPI Actor (Agent) — identified by account to stay pseudonymous. */
export const xapiActor = z.object({
  objectType: z.literal('Agent').default('Agent'),
  name: z.string().optional(),
  account: z.object({
    homePage: z.string().url(),
    name: z.string(), // typically the uid
  }),
});

export const xapiVerb = z.object({
  id: z.string().url(),
  display: z.record(z.string(), z.string()).optional(),
});

export const xapiObject = z.object({
  objectType: z.literal('Activity').default('Activity'),
  id: z.string().url(),
  definition: z
    .object({
      name: z.record(z.string(), z.string()).optional(),
      description: z.record(z.string(), z.string()).optional(),
      type: z.string().url().optional(),
    })
    .optional(),
});

export const xapiResult = z
  .object({
    completion: z.boolean().optional(),
    success: z.boolean().optional(),
    score: z
      .object({
        scaled: z.number().min(-1).max(1).optional(),
        raw: z.number().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
    duration: z.string().optional(), // ISO 8601 duration
  })
  .optional();

/** /lrs/statements/{stmtId} — every statement is tenant-tagged via context.extensions. */
export const xapiStatement = z.object({
  id: z.string().uuid().optional(),
  actor: xapiActor,
  verb: xapiVerb,
  object: xapiObject,
  result: xapiResult,
  context: z
    .object({
      registration: z.string().uuid().optional(),
      extensions: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  timestamp: isoDateTime.optional(),
  /** Server-attached tenant scope (mirrors context.extensions tenant key). */
  tenantId: tenantId.optional(),
  actorUid: uid.optional(),
});
export type XapiStatement = z.infer<typeof xapiStatement>;

/** Known verb ids as a type for ergonomic emission. */
export type XapiVerbId = (typeof XAPI_VERBS)[keyof typeof XAPI_VERBS];
