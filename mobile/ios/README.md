# Soteria Assurance — iOS

Native iOS client (Swift · SwiftUI) for the Forge API.

> **Requires macOS + Xcode.** This app cannot be built on Linux. The sources here
> were authored in a Linux sandbox and have not been compiled — treat the first
> Xcode build as the verification step.

## Prerequisites

- Xcode 15+ (iOS 16 deployment target)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) to
  generate the `.xcodeproj` from `project.yml`
- A reachable Forge API (Django on Railway, or `http://localhost:8000` locally) and a
  member account on it. The API URL is `ForgeAPI.baseURL` in `Sources/Services/ForgeAPI.swift`.

## Setup

1. Generate and open the project:
   ```bash
   cd ios
   xcodegen generate
   open SoteriaAssurance.xcodeproj
   ```
2. Build & run on a simulator or device.

> Prefer not to use XcodeGen? Create a new SwiftUI App target named
> `SoteriaAssurance` (bundle id `com.soteria.assurance`), then add the files under
> `Sources/`. There are no package dependencies.

## Architecture

```
Sources/
  Models.swift                 Course · Module · Lesson · Principal (Forge API wire shapes)
  Services/ForgeAPI.swift      JSON over URLSession, in-memory tokens
  Services/AuthService.swift   POST /api/auth/login, GET /api/me
  Services/CourseService.swift GET /api/courses, GET /api/courses/{id}
  ViewModels/                  LoginViewModel · CoursesViewModel (@MainActor ObservableObject)
  Views/                       RootView · LoginView · CoursesView
  SoteriaAssuranceApp.swift    @main
```

Sign-in posts the organization (tenant) id, email and password to `/api/auth/login`
(`client: "mobile"`, so the refresh token comes back in the body), then reads the
member's role and tenant from `/api/me`. Every request carries the access token and
`X-Forge-Tenant`; the API scopes data to the tenant with Postgres row-level security.
A 401 triggers one refresh via `/api/auth/refresh`. Tokens live in memory only.
