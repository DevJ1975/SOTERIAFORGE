# Soteria Assurance — Native Mobile Monorepo

Two **separate, truly native** clients for the Soteria Assurance LMS, backed by the
Forge API (Django on Railway):

| App         | Stack                    | Path       |
| ----------- | ------------------------ | ---------- |
| **Android** | Kotlin · Jetpack Compose | `android/` |
| **iOS**     | Swift · SwiftUI          | `ios/`     |

Both are independent apps with their own toolchains — no shared runtime code. The
**backend contract is shared** (the REST API under `/api/`, camelCase JSON), documented
by the OpenAPI schema generated from `backend/`.

## Backend contract (must stay in sync with the web platform)

- **Auth:** `POST /api/auth/login` with `{email, password, tenant, client: "mobile"}`
  returns `{access, refresh}`; refresh with `POST /api/auth/refresh`. Role and tenant
  come from `GET /api/me`. Send `Authorization: Bearer <access>` and `X-Forge-Tenant`.
- **Roles:** `superadmin · tenant_admin · instructor · learner · b2c_customer`.
- **Courses:** `GET /api/courses`; `GET /api/courses/{id}` returns the outline with
  `modules[].lessons[]`. Tenant isolation is enforced by the API (Postgres RLS).
- **Enrollments:** `GET /api/enrollments/me`, `POST /api/courses/{id}/enroll`.

Privileged writes (roles, provisioning) are API-only; the mobile clients never make
them. See `backend/apps/*/serializers.py` for the exact shapes.

## What's implemented (foundation slice)

- Tenant-scoped email/password sign-in (organization id input).
- Role and tenant from `GET /api/me`.
- Tenant-scoped course list and course outline (modules and lessons) from the API.

These data layers were rewritten for the Forge API without being compiled
or run (no Android/Xcode toolchain in the porting environment); treat the first build
as the verification step.

- Clean separation: repository/service layer → view-model → UI.

Not yet: SCORM/cmi5/Unity players, quizzes, games, offline xAPI. These map
to the same backend and are the next slices.

## Getting started

Each app has its own README:

- [`android/README.md`](android/README.md) — Android Studio / Gradle.
- [`ios/README.md`](ios/README.md) — Xcode (requires macOS; **cannot build on Linux**).

Both apps talk to `https://api.soteriaforge.com` by default; see each README to point
them at another API.

## Extracting into a standalone repo

This monorepo was staged inside `soteriaforge/mobile/`. To lift it into its own
GitHub repo with history preserved:

```bash
# from a clone of soteriaforge, on the branch that contains mobile/
git subtree split --prefix=mobile -b soteria-mobile-export
# create the new empty repo on GitHub, then:
cd /path/to/new/empty/clone
git pull /path/to/soteriaforge soteria-mobile-export
git push origin main
```

Or, for a clean single-commit start, just copy the `mobile/` directory contents
into the new repo and commit.
