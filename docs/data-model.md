# Data model

The authoritative schema is the Django models and serializers in
[`backend/apps`](../backend/apps) (Postgres). The zod definitions in
[`libs/shared/src/lib/schemas`](../libs/shared/src/lib/schemas) describe the wire
shapes the Angular apps validate. This document is the human-readable map; keep it
in sync when either changes.

## Tenant-scoped table strategy

One shared Postgres schema. Every tenant-owned table carries a `tenant_id`; the API
filters on it from request context and Postgres row-level security policies enforce
it again (`SET app.tenant_id` per request/transaction), so a missing filter cannot
leak rows. The runtime database role is not a superuser. Superadmin analytics are
SQL aggregates behind superadmin-only endpoints.

| App (`backend/apps/`) | Main tables                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `tenants`             | Tenant (name, branding, status, plan, custom domain)                  |
| `accounts`            | Member (role, status, profile), one-time tokens, refresh tokens       |
| `learning`            | Course, Module, Lesson (key points, tags), Enrollment, LessonProgress |
| `assessments`         | Quiz, questions, attempts (first-try, server timestamp)               |
| `games`               | Game (engine, config, assetRefs, riveAssetRef)                        |
| `gamification`        | XpEvent, ActivityDay, Cohort, Section, Crew (badges still to come)    |
| `coach`               | Knowledge sources, chunks (pgvector), coach turns                     |
| `engage`              | Live sessions, polls, game rounds, attendance                         |
| `standards`           | Package, Binding, Launch, Statement (SCORM/cmi5/xAPI)                 |
| `assets`              | Uploaded media (S3-compatible bucket, signed URLs)                    |
| `library`             | Platform library courses shared into tenants as drafts                |
| `reports`             | Enrollment progress report                                            |
| `audit`               | Append-only audit log                                                 |

The reserved tenant id `library` holds platform library content (status archived,
hidden from `GET /api/tenants`).

## Timestamps

Timestamps cross the API as ISO-8601 strings and are stored as `timestamptz`.
