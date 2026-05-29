# Data model & Firestore index manifest

The authoritative schema is the zod definitions in
[`libs/shared/src/lib/schemas`](../libs/shared/src/lib/schemas). This document
is the human-readable map; keep it in sync when schemas change.

## Tenant-scoped collection strategy

Top-level `/tenants/{tenantId}` with nested subcollections makes isolation
explicit and keeps security rules simple. Every tenant-scoped document carries a
`tenantId` field (belt-and-suspenders with the path) so collection-group queries
can filter by tenant. No client query may cross tenant boundaries; superadmin
analytics aggregations run server-side only.

```
/platform/config                         superadmin-only; seeded server-side
/platform/featureFlags
/tenants/{tenantId}                       Tenant (name, branding, status, plan, gcipTenantId)
  /members/{uid}                          Member (role, status, profile, xp, level, streak)
  /courses/{courseId}                     Course (title, status, tags, badgeRefs, xpReward)
    /modules/{moduleId}                   Module (order, contentType, assetRef, completion)
    /enrollments/{uid}                    Enrollment (progressPct, completed, score, cmi)
  /quizzes/{quizId}                       Quiz (questions, passThreshold, scoring)
  /games/{gameId}                         Game (engine, config, assetRefs, riveAssetRef)
  /badges/{badgeId}                       Badge (Open Badges 3.0 metadata, criteria)
  /leaderboard/{period}                   Leaderboard (denormalized ranked entries) [server-write]
  /ai/knowledgeBase/{docId}               KnowledgeSource (ingestion status)
  /ai/vectors/{docId}                     VectorChunk (embedding) [server-only]
  /ai/conversations/{uid}/messages/{id}   ChatMessage (citations)
/lrs/statements/{stmtId}                  XapiStatement [tenant-tagged, server-write]
/b2c/catalog/{productId}                  CatalogProduct (Stripe priceId, grants)
/b2c/customers/{uid}                      B2cCustomer (entitlements, purchaseHistory) [server-write]
/stripe/events/{eventId}                  StripeEventLog (webhook idempotency) [server-only]
```

## Write-surface summary (see `firestore.rules`)

| Path                   | Client read          | Client write                                  |
| ---------------------- | -------------------- | --------------------------------------------- |
| platform/\*\*          | superadmin           | ✗ (server)                                    |
| tenants/{t}            | in-tenant            | ✗ (provisioning fn)                           |
| members/{uid}          | self or tenant_admin | self: profile/activity only (not role/status) |
| courses/\*\*           | in-tenant            | author roles                                  |
| enrollments/{uid}      | self or tenant_admin | self only; score validated server-side        |
| leaderboard            | in-tenant            | ✗ (server, anti-cheat)                        |
| ai/vectors             | ✗                    | ✗ (server retrieval)                          |
| ai/conversations/{uid} | self                 | self (create only)                            |
| lrs/statements         | superadmin           | ✗ (ingest fn)                                 |
| b2c/catalog            | public               | superadmin                                    |
| b2c/customers          | self                 | ✗ (Stripe webhook)                            |

## Composite index manifest

Tracked in [`firestore.indexes.json`](../firestore.indexes.json). Current
indexes:

| Collection (scope)           | Fields                                    |
| ---------------------------- | ----------------------------------------- |
| `courses` (collection)       | status ↑, title ↑                         |
| `members` (collection)       | status ↑, displayName ↑                   |
| `members` (collection)       | role ↑, xp ↓                              |
| `enrollments` (group)        | tenantId ↑, completed ↑, lastActivityAt ↓ |
| `knowledgeBase` (collection) | status ↑, createdAt ↓                     |
| `statements` (collection)    | tenantId ↑, timestamp ↓                   |
| `statements` (collection)    | actorUid ↑, timestamp ↓                   |
| `messages` (collection)      | uid ↑, createdAt ↑                        |

**Field override:** `vectors.embedding` — vector config, dimension 768 (Vertex
AI `text-embedding` default; adjust to the chosen model). Used by Firestore
`findNearest` KNN retrieval (Phase 6).

## Timestamps

Cross the application boundary as ISO-8601 strings; stored as Firestore
Timestamps at rest. Converters in `@forge/data-access` handle the mapping.
