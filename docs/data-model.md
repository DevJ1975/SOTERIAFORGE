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
  /knowledgeBase/{docId}                  KnowledgeSource (ingestion status)
  /vectors/{docId}                        VectorChunk (embedding) [server-only]
  /conversations/{uid}/messages/{id}      ChatMessage (citations)
/lrs/{stmtId}                             XapiStatement [tenant-tagged, server-write]
/catalog/{productId}                      CatalogProduct (Stripe priceId, grants)
/customers/{uid}                          B2cCustomer (entitlements, purchaseHistory) [server-write]
/stripeEvents/{eventId}                   StripeEventLog (webhook idempotency) [server-only]
```

> **Firestore path rule:** document references must have an **even** number of
> path segments. Intermediate grouping segments (`ai/`, `b2c/`) are intentionally
> omitted (e.g. `tenants/{t}/knowledgeBase/{id}`, top-level `catalog/{id}`) so
> every path resolves to a valid document and matches `firestore.rules`.

## Write-surface summary (see `firestore.rules`)

| Path                | Client read          | Client write                                  |
| ------------------- | -------------------- | --------------------------------------------- |
| platform/\*\*       | superadmin           | ✗ (server)                                    |
| tenants/{t}         | in-tenant            | ✗ (provisioning fn)                           |
| members/{uid}       | self or tenant_admin | self: profile/activity only (not role/status) |
| courses/\*\*        | in-tenant            | author roles                                  |
| enrollments/{uid}   | self or tenant_admin | self only; score validated server-side        |
| leaderboard         | in-tenant            | ✗ (server, anti-cheat)                        |
| vectors             | ✗                    | ✗ (server retrieval)                          |
| conversations/{uid} | self                 | self (create only)                            |
| lrs                 | superadmin           | ✗ (ingest fn)                                 |
| catalog             | public               | superadmin                                    |
| customers           | self                 | ✗ (Stripe webhook)                            |

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
| `lrs` (collection)           | tenantId ↑, timestamp ↓                   |
| `lrs` (collection)           | actorUid ↑, timestamp ↓                   |
| `messages` (collection)      | uid ↑, createdAt ↑                        |

**Field override:** `vectors.embedding` — vector config, dimension 768 (Vertex
AI `text-embedding` default; adjust to the chosen model). Used by Firestore
`findNearest` KNN retrieval (Phase 6).

## Timestamps

Cross the application boundary as ISO-8601 strings; stored as Firestore
Timestamps at rest. Converters in `@forge/data-access` handle the mapping.
