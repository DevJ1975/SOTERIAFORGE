# Soteria Assurance — Native Mobile Monorepo

Two **separate, truly native** clients for the Soteria Assurance LMS, backed by the
existing Firebase platform (GCIP multi-tenancy + Cloud Firestore):

| App         | Stack                                   | Path       |
| ----------- | --------------------------------------- | ---------- |
| **Android** | Kotlin · Jetpack Compose · Firebase SDK | `android/` |
| **iOS**     | Swift · SwiftUI · firebase-ios-sdk      | `ios/`     |

Both are independent apps with their own toolchains — no shared runtime code. The
**data model and backend contract are shared** (Firestore collections + GCIP
custom claims), mirrored from `libs/shared` in the main `soteriaforge` repo.

## Backend contract (must stay in sync with the web platform)

- **Auth:** Firebase Auth with **GCIP multi-tenancy**. The client sets the
  Identity Platform tenant id (`gcipTenantId`) _before_ sign-in. After sign-in,
  read custom claims from the ID token: `role`, `tenantId`, `entitlements`.
- **Roles:** `superadmin · tenant_admin · instructor · learner · b2c_customer`.
- **Courses:** `/tenants/{tenantId}/courses/{courseId}` — readable by any member
  of the tenant (`claims.tenantId == tenantId`), enforced in Firestore rules.
- **Modules:** `/tenants/{tenantId}/courses/{courseId}/modules/{moduleId}`.
- **Enrollments:** `/tenants/{tenantId}/courses/{courseId}/enrollments/{uid}`.

Privileged writes (claims, provisioning, entitlements) are **Cloud Functions
only** — the mobile clients never write them. See the main repo's
`firestore.rules` and `libs/shared/src/lib/schemas`.

## What's implemented (foundation slice)

- Tenant-scoped email/password sign-in (GCIP tenant id input).
- Reading custom claims (role / tenantId) from the ID token.
- Tenant-scoped course list from Firestore + course detail with modules.
- Clean separation: repository/service layer → view-model → UI.

Not yet: SCORM/cmi5/Unity players, quizzes, games, offline xAPI, push. These map
to the same backend and are the next slices.

## Getting started

Each app has its own README:

- [`android/README.md`](android/README.md) — Android Studio / Gradle.
- [`ios/README.md`](ios/README.md) — Xcode (requires macOS; **cannot build on Linux**).

You must drop in your own Firebase config files (not committed):

- Android: `android/app/google-services.json`
- iOS: `ios/GoogleService-Info.plist`

Example placeholders are provided as `*.example`.

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
